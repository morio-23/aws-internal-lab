import { App } from "aws-cdk-lib";

import { PlatformOperationsStack } from "../lib/platform-operations-stack.js";
import { RuntimeStack } from "../lib/runtime-stack.js";

const app = new App({ outdir: "cdk.out" });

new PlatformOperationsStack(app, "AwsInternalLabPlatformOperations", {
  env: {
    account: process.env.PLATFORM_AWS_ACCOUNT ?? process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "ap-northeast-1",
  },
  description: "AWS Internal Lab Phase 0 Platform operation queue",
});

new RuntimeStack(app, "AwsInternalLabRuntime", {
  env: {
    account: process.env.RUNTIME_AWS_ACCOUNT ?? process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "ap-northeast-1",
  },
  description: "AWS Internal Lab Phase 0 Standard Runtime",
});

app.synth();
