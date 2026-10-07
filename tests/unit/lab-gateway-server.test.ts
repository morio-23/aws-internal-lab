import assert from "node:assert/strict";
import test from "node:test";

import { createLabCredential, type LabBinding } from "../../apps/lab-gateway/src/index.js";
import { createLabGatewayServer } from "../../apps/lab-gateway/src/server.js";
import { createCapabilityRegistry } from "../../packages/service-capabilities/src/index.js";

async function withServer(
  run: (baseUrl: string, binding: LabBinding) => Promise<void>,
): Promise<void> {
  const virtualAccountId = "012345678901";
  const sessionId = "session-http";
  const binding: LabBinding = {
    workspaceId: "workspace-http",
    sessionId,
    virtualAccountId,
    enabledRegions: ["ap-northeast-1", "ap-northeast-3"],
    credential: createLabCredential({ virtualAccountId, sessionId }),
  };

  const registry = createCapabilityRegistry([
    {
      serviceCode: "demo",
      operation: "List",
      provider: "internal",
      runtimeRequirement: "standard",
      enabled: true,
    },
  ]);

  const server = createLabGatewayServer({
    binding,
    registry,
    providers: [
      {
        kind: "internal",
        async invoke(input) {
          return {
            provider: "internal",
            operation: input.request.operation,
          };
        },
      },
    ],
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("failed to bind test server");
  }

  try {
    await run(`http://127.0.0.1:${address.port}`, binding);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

test("lab gateway HTTP boundary routes a bound request and returns correlation id", async () => {
  await withServer(async (baseUrl, binding) => {
    const response = await fetch(`${baseUrl}/invoke`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workspaceId: binding.workspaceId,
        sessionId: binding.sessionId,
        virtualAccountId: binding.virtualAccountId,
        virtualRegion: "ap-northeast-3",
        serviceCode: "demo",
        operation: "List",
        accessKeyId: binding.credential.accessKeyId,
        secretAccessKey: binding.credential.secretAccessKey,
        correlationId: "corr-http",
      }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      correlationId: "corr-http",
      result: {
        provider: "internal",
        operation: "List",
      },
    });
  });
});

test("lab gateway HTTP boundary rejects unsupported regions before provider work", async () => {
  await withServer(async (baseUrl, binding) => {
    const response = await fetch(`${baseUrl}/invoke`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workspaceId: binding.workspaceId,
        sessionId: binding.sessionId,
        virtualAccountId: binding.virtualAccountId,
        virtualRegion: "us-east-1",
        serviceCode: "demo",
        operation: "List",
        accessKeyId: binding.credential.accessKeyId,
        secretAccessKey: binding.credential.secretAccessKey,
        correlationId: "corr-invalid-region",
      }),
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: { code: "INVALID_REGION" },
    });
  });
});
