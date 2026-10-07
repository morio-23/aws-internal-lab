import assert from "node:assert/strict";
import test from "node:test";

import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";

import { RuntimeStack } from "../../infra/cdk/lib/runtime-stack.js";

test("RuntimeStack creates an isolated Fargate runtime with private AWS endpoints", () => {
  const app = new App();
  const stack = new RuntimeStack(app, "TestRuntimeStack");
  const template = Template.fromStack(stack);

  template.resourceCountIs("AWS::EC2::NatGateway", 0);
  template.resourceCountIs("AWS::ECS::Cluster", 1);
  template.resourceCountIs("AWS::ECR::Repository", 2);
  template.resourceCountIs("AWS::EC2::VPCEndpoint", 4);

  template.hasResourceProperties("AWS::ECS::TaskDefinition", {
    Cpu: "1024",
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
});
