import assert from "node:assert/strict";
import test from "node:test";

import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";

import { RuntimeStack } from "../lib/runtime-stack.js";

test("RuntimeStack creates an isolated Fargate runtime with private AWS endpoints", () => {
  const app = new App();
  const stack = new RuntimeStack(app, "TestRuntimeStack");
  const template = Template.fromStack(stack);

  template.resourceCountIs("AWS::EC2::NatGateway", 0);
  template.resourceCountIs("AWS::ECS::Cluster", 1);
  template.resourceCountIs("AWS::ECR::Repository", 2);
  template.resourceCountIs("AWS::EC2::VPCEndpoint", 4);
  template.resourceCountIs("AWS::EC2::Route", 2);

  template.hasResourceProperties("AWS::EC2::Route", {
    DestinationCidrBlock: { Ref: "PlatformVpcCidr" },
    VpcPeeringConnectionId: { Ref: "RuntimeVpcPeeringConnectionId" },
  });
  template.hasResourceProperties("AWS::EC2::SecurityGroupIngress", {
    IpProtocol: "tcp",
    FromPort: 8080,
    ToPort: 8080,
    SourceSecurityGroupId: { Ref: "PlatformBffSecurityGroupId" },
    SourceSecurityGroupOwnerId: { Ref: "PlatformAccountId" },
  });

  template.hasResourceProperties("AWS::ECS::TaskDefinition", {
    Cpu: "1024",
    Volumes: Match.arrayWith([
      Match.objectLike({
        Name: "lab-state",
        ConfiguredAtLaunch: true,
      }),
    ]),
    Memory: "2048",
    NetworkMode: "awsvpc",
    RequiresCompatibilities: ["FARGATE"],
    EphemeralStorage: {
      SizeInGiB: 30,
    },
    ContainerDefinitions: Match.arrayWith([
      Match.objectLike({
        Name: "ministack",
        Privileged: false,
      }),
      Match.objectLike({
        Name: "lab-gateway",
        Privileged: false,
        ReadonlyRootFilesystem: true,
      }),
    ]),
  });

  template.hasResourceProperties("AWS::IAM::Role", {
    AssumeRolePolicyDocument: Match.objectLike({
      Statement: Match.arrayWith([
        Match.objectLike({
          Principal: { Service: "ecs.amazonaws.com" },
        }),
      ]),
    }),
  });

  template.hasResourceProperties("AWS::IAM::Policy", {
    PolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({ Action: "ecs:ListTasks" }),
      ]),
    },
  });
  template.hasResourceProperties("AWS::IAM::Policy", {
    PolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({
          Action: "ecs:TagResource",
          Condition: Match.objectLike({ StringEquals: Match.objectLike({ "ecs:CreateAction": "RunTask" }) }),
        }),
      ]),
    },
  });

  const json = template.toJSON();
  const subnets = Object.values(json.Resources).filter(
    (resource) =>
      (resource as { Type?: string }).Type === "AWS::EC2::Subnet",
  );
  assert.equal(subnets.length >= 2, true);

  const internetGateways = Object.values(json.Resources).filter(
    (resource) =>
      (resource as { Type?: string }).Type === "AWS::EC2::InternetGateway",
  );
  assert.equal(internetGateways.length, 0);

  const endpoints = Object.values(json.Resources)
    .filter((resource) => (resource as { Type?: string }).Type === "AWS::EC2::VPCEndpoint")
    .map((resource) => (resource as { Properties: { VpcEndpointType: string; ServiceName: unknown } }).Properties);
  assert.deepEqual(
    endpoints.map((endpoint) => endpoint.VpcEndpointType).sort(),
    ["Gateway", "Interface", "Interface", "Interface"],
  );
  const serviceNames = endpoints.map((endpoint) => JSON.stringify(endpoint.ServiceName));
  for (const service of ["s3", "ecr.api", "ecr.dkr", "logs"]) {
    assert.equal(serviceNames.some((name) => name.includes(service)), true);
  }

  const taskDefinition = Object.values(json.Resources).find(
    (resource) => (resource as { Type?: string }).Type === "AWS::ECS::TaskDefinition",
  ) as { Properties: { ContainerDefinitions: Array<{ Privileged?: boolean; MountPoints?: Array<{ SourceVolume: string; ContainerPath: string }> }> } };
  assert.equal(taskDefinition.Properties.ContainerDefinitions.length, 2);
  for (const container of taskDefinition.Properties.ContainerDefinitions) {
    assert.equal(container.Privileged, false);
    assert.equal(container.MountPoints?.some((mount) => mount.ContainerPath.includes("docker.sock")) ?? false, false);
    assert.equal(container.MountPoints?.every((mount) => mount.SourceVolume === "lab-state") ?? true, true);
  }
});
