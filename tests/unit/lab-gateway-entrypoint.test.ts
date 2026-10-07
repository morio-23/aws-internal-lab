import assert from "node:assert/strict";
import test from "node:test";

import { generateRuntimeTokenKeyPair } from "../../packages/runtime-auth/src/index.js";
import { createRuntimeGatewayFromEnvironment } from "../../apps/lab-gateway/src/main.js";

function withRuntimeEnv(run: () => void) {
  const snapshot = { ...process.env };
  try {
    const keys = generateRuntimeTokenKeyPair();
    process.env.LAB_WORKSPACE_ID = "workspace-runtime";
    process.env.LAB_SESSION_ID = "session-runtime";
    process.env.LAB_VIRTUAL_ACCOUNT_ID = "012345678901";
    process.env.LAB_ENABLED_REGIONS = JSON.stringify([
      "ap-northeast-1",
      "ap-northeast-3",
    ]);
    process.env.PLATFORM_RUNTIME_PUBLIC_KEY_B64 = Buffer.from(
      keys.publicKeyPem,
    ).toString("base64");
    run();
  } finally {
    process.env = snapshot;
  }
}

test("Fargate Lab Gateway can bootstrap from runtime-bound environment", () => {
  withRuntimeEnv(() => {
    const server = createRuntimeGatewayFromEnvironment();
    assert.equal(typeof server.listen, "function");
    server.close();
  });
});

test("Fargate Lab Gateway refuses to start without platform runtime key", () => {
  withRuntimeEnv(() => {
    delete process.env.PLATFORM_RUNTIME_PUBLIC_KEY_B64;
    assert.throws(
      () => createRuntimeGatewayFromEnvironment(),
      /PLATFORM_RUNTIME_PUBLIC_KEY_B64/,
    );
  });
});

test("Fargate Lab Gateway rejects unsupported enabled regions at startup", () => {
  withRuntimeEnv(() => {
    process.env.LAB_ENABLED_REGIONS = JSON.stringify(["us-east-1"]);
    assert.throws(
      () => createRuntimeGatewayFromEnvironment(),
      /Unsupported virtual region/,
    );
  });
});

test("Fargate Lab Gateway rejects a public MiniStack endpoint", () => {
  withRuntimeEnv(() => {
    process.env.MINISTACK_ENDPOINT = "https://s3.ap-northeast-1.amazonaws.com";
    assert.throws(
      () => createRuntimeGatewayFromEnvironment(),
      /MINISTACK_ENDPOINT_MUST_BE_LOOPBACK/,
    );
  });
});
