import assert from "node:assert/strict";
import test from "node:test";

import {
  LabGatewayError,
  createLabCredential,
  dispatchLabRequest,
  routeLabRequest,
  type LabBinding,
} from "../../apps/lab-gateway/src/index.js";
import {
  createCapabilityRegistry,
} from "../../packages/service-capabilities/src/index.js";

function fixture(): LabBinding {
  const virtualAccountId = "012345678901";
  const sessionId = "session-1";
  return {
    workspaceId: "workspace-1",
    sessionId,
    virtualAccountId,
    enabledRegions: ["ap-northeast-1", "ap-northeast-3"],
    credential: createLabCredential({ virtualAccountId, sessionId }),
  };
}

function request(binding: LabBinding, overrides: Record<string, string> = {}) {
  return {
    workspaceId: binding.workspaceId,
    sessionId: binding.sessionId,
    virtualAccountId: binding.virtualAccountId,
    virtualRegion: "ap-northeast-1",
    serviceCode: "demo",
    operation: "List",
    accessKeyId: binding.credential.accessKeyId,
    secretAccessKey: binding.credential.secretAccessKey,
    correlationId: "corr-1",
    ...overrides,
  };
}

const registry = createCapabilityRegistry([
  {
    serviceCode: "demo",
    operation: "List",
    provider: "ministack",
    runtimeRequirement: "standard",
    enabled: true,
  },
  {
    serviceCode: "demo",
    operation: "Explain",
    provider: "internal",
    runtimeRequirement: "standard",
    enabled: true,
  },
  {
    serviceCode: "demo",
    operation: "Denied",
    provider: "deny",
    runtimeRequirement: "standard",
    enabled: true,
  },
]);

test("gateway validates workspace account region credential and routes by operation", () => {
  const binding = fixture();

  assert.equal(
    routeLabRequest({ binding, request: request(binding), registry }).provider,
    "ministack",
  );
  assert.equal(
    routeLabRequest({
      binding,
      request: request(binding, { operation: "Explain" }),
      registry,
    }).provider,
    "internal",
  );

  assert.throws(
    () =>
      routeLabRequest({
        binding,
        request: request(binding, { workspaceId: "workspace-other" }),
        registry,
      }),
    (error) =>
      error instanceof LabGatewayError && error.code === "INVALID_WORKSPACE",
  );

  assert.throws(
    () =>
      routeLabRequest({
        binding,
        request: request(binding, { virtualAccountId: "999999999999" }),
        registry,
      }),
    (error) =>
      error instanceof LabGatewayError && error.code === "INVALID_ACCOUNT",
  );

  assert.throws(
    () =>
      routeLabRequest({
        binding,
        request: request(binding, { virtualRegion: "us-east-1" }),
        registry,
      }),
    /Unsupported virtual region/,
  );

  assert.throws(
    () =>
      routeLabRequest({
        binding,
        request: request(binding, { operation: "Denied" }),
        registry,
      }),
    (error) =>
      error instanceof LabGatewayError && error.code === "OPERATION_DENIED",
  );
});

test("gateway rejects real AWS-like and incorrect lab credentials before provider invocation", async () => {
  const binding = fixture();
  let invoked = 0;

  await assert.rejects(
    dispatchLabRequest({
      binding,
      request: request(binding, {
        accessKeyId: "AKIA1234567890123456",
      }),
      registry,
      providers: [
        {
          kind: "ministack",
          async invoke() {
            invoked += 1;
            return {};
          },
        },
      ],
    }),
    (error) =>
      error instanceof LabGatewayError &&
      error.code === "INVALID_ACCOUNT",
  );

  await assert.rejects(
    dispatchLabRequest({
      binding,
      request: request(binding, {
        secretAccessKey: "wrong-secret",
      }),
      registry,
      providers: [
        {
          kind: "ministack",
          async invoke() {
            invoked += 1;
            return {};
          },
        },
      ],
    }),
    (error) =>
      error instanceof LabGatewayError &&
      error.code === "INVALID_CREDENTIAL",
  );

  assert.equal(invoked, 0);
});

test("gateway propagates correlation id to selected provider", async () => {
  const binding = fixture();
  const seen: string[] = [];

  const result = await dispatchLabRequest({
    binding,
    request: request(binding),
    registry,
    providers: [
      {
        kind: "ministack",
        async invoke(input) {
          seen.push(input.route.correlationId);
          return { ok: true };
        },
      },
    ],
  });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(seen, ["corr-1"]);
});
