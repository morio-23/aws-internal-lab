import { App } from "aws-cdk-lib";

import { RuntimeStack } from "../lib/runtime-stack.js";

const app = new App();

new RuntimeStack(app, "AwsInternalLabRuntime", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "ap-northeast-1",
  },
  description: "AWS Internal Lab Phase 0 Standard Runtime",
});

app.synth();
