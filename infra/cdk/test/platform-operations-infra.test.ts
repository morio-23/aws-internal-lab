import assert from "node:assert/strict";
import test from "node:test";

import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";

import { PlatformOperationsStack } from "../lib/platform-operations-stack.js";
import { PlatformRuntimeConnectivityStack } from "../lib/platform-runtime-connectivity-stack.js";

test("PlatformOperationsStack creates FIFO operation queue, DLQ and immutable worker repository", () => {
  const app = new App();
  const stack = new PlatformOperationsStack(app, "TestPlatformOperationsStack");
  const template = Template.fromStack(stack);

  template.resourceCountIs("AWS::SQS::Queue", 2);
  template.hasResourceProperties("AWS::SQS::Queue", {
    FifoQueue: true,
    VisibilityTimeout: 1800,
    ReceiveMessageWaitTimeSeconds: 20,
    RedrivePolicy: Match.objectLike({
      maxReceiveCount: 5,
    }),
  });
  template.hasResourceProperties("AWS::SQS::Queue", {
    FifoQueue: true,
    MessageRetentionPeriod: 1209600,
  });
  template.hasResourceProperties("AWS::ECR::Repository", {
    ImageScanningConfiguration: { ScanOnPush: true },
    ImageTagMutability: "IMMUTABLE",
  });
});

test("PlatformOperationsStack runs a private worker with secret injection and scoped queue access", () => {
  const template = Template.fromStack(new PlatformOperationsStack(new App(), "WorkerStack"));
  template.resourceCountIs("AWS::ECS::Service", 1);
  template.hasResourceProperties("AWS::ECS::Service", {
    LaunchType: "FARGATE",
    NetworkConfiguration: Match.objectLike({
      AwsvpcConfiguration: Match.objectLike({ AssignPublicIp: "DISABLED" }),
    }),
  });
  template.hasResourceProperties("AWS::ECS::TaskDefinition", {
    RequiresCompatibilities: ["FARGATE"],
    ContainerDefinitions: Match.arrayWith([
      Match.objectLike({
        Name: "operation-worker",
        Command: ["node", "dist/apps/operation-worker/src/main.js"],
        Secrets: Match.arrayWith([
          Match.objectLike({ Name: "DATABASE_URL" }),
          Match.objectLike({ Name: "PLATFORM_RUNTIME_PRIVATE_KEY_B64" }),
          Match.objectLike({ Name: "PLATFORM_RUNTIME_PUBLIC_KEY_B64" }),
        ]),
      }),
    ]),
  });
  const resources = Object.values(template.toJSON().Resources) as Array<{ Type: string; Properties?: Record<string, unknown> }>;
  const service = resources.find((resource) => resource.Type === "AWS::ECS::Service");
  const network = service?.Properties?.NetworkConfiguration as { AwsvpcConfiguration: { SecurityGroups: unknown[] } };
  assert.equal(network.AwsvpcConfiguration.SecurityGroups.length, 1);
  assert.equal(JSON.stringify(service).includes("PlatformBffSecurityGroupId"), false);
  assert.equal(resources.some((resource) => resource.Type === "AWS::EC2::SecurityGroupEgress" && resource.Properties?.ToPort === 8080), false);
  template.hasResourceProperties("AWS::EC2::SecurityGroupIngress", {
    GroupId: { Ref: "PlatformBffSecurityGroupId" },
    FromPort: 3001,
    ToPort: 3001,
  });
  const task = resources.find((resource) => resource.Type === "AWS::ECS::TaskDefinition");
  assert.ok(task);
  const container = (task.Properties?.ContainerDefinitions as Array<{ Environment?: Array<{ Name: string }> }>)[0];
  assert.ok(container);
  assert.equal(container.Environment?.some((entry) => entry.Name === "DATABASE_URL"), false);
  const policies = resources.filter((resource) => resource.Type === "AWS::IAM::Policy");
  const policyJson = JSON.stringify(policies);
  assert.match(policyJson, /sqs:ReceiveMessage/);
  assert.match(policyJson, /sqs:DeleteMessage/);
  assert.match(policyJson, /sqs:ChangeMessageVisibility/);
  assert.match(policyJson, /sts:AssumeRole/);
  assert.doesNotMatch(policyJson, /"Resource":"\*".*sts:AssumeRole/);
  assert.equal(JSON.stringify(resources).includes("0.0.0.0/0"), false);
});

test("PlatformOperationsStack provisions private AWS API endpoints without NAT or Internet routes", () => {
  const template = Template.fromStack(new PlatformOperationsStack(new App(), "EndpointStack"));
  template.resourceCountIs("AWS::EC2::NatGateway", 0);
  template.resourceCountIs("AWS::EC2::InternetGateway", 0);
  const resources = Object.values(template.toJSON().Resources) as Array<{ Type: string; Properties?: { ServiceName?: unknown } }>;
  const endpointNames = resources
    .filter((resource) => resource.Type === "AWS::EC2::VPCEndpoint")
    .map((resource) => JSON.stringify(resource.Properties?.ServiceName));
  for (const service of ["sqs", "ecs", "ec2", "sts", "secretsmanager", "ecr.api", "ecr.dkr", "logs", "s3"]) {
    assert.equal(endpointNames.some((name) => name.includes(service)), true, service);
  }
});

test("Platform reciprocal routes use the Runtime-created peering connection", () => {
  const template = Template.fromStack(new PlatformRuntimeConnectivityStack(new App(), "ConnectivityStack"));
  template.resourceCountIs("AWS::EC2::VPCPeeringConnection", 0);
  template.resourceCountIs("AWS::EC2::Route", 2);
  const routes = Object.values(template.toJSON().Resources)
    .filter((resource) => (resource as { Type: string }).Type === "AWS::EC2::Route")
    .map((resource) => (resource as { Properties: Record<string, unknown> }).Properties);
  for (const route of routes) {
    assert.deepEqual(route.DestinationCidrBlock, { Ref: "RuntimeVpcCidr" });
    assert.deepEqual(route.VpcPeeringConnectionId, { Ref: "RuntimeVpcPeeringConnectionId" });
  }
  assert.deepEqual(routes.map((route) => JSON.stringify(route.RouteTableId)).sort(), [
    JSON.stringify({ Ref: "PlatformPrivateRouteTableIdA" }),
    JSON.stringify({ Ref: "PlatformPrivateRouteTableIdB" }),
  ]);
});
