import test from "node:test";

import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";

import { PlatformOperationsStack } from "../lib/platform-operations-stack.js";

test("PlatformOperationsStack creates FIFO operation queue, DLQ and immutable worker repository", () => {
  const app = new App();
  const stack = new PlatformOperationsStack(app, "TestPlatformOperationsStack");
  const template = Template.fromStack(stack);

  template.resourceCountIs("AWS::SQS::Queue", 2);
  template.hasResourceProperties("AWS::SQS::Queue", {
    FifoQueue: true,
    VisibilityTimeout: 300,
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
