import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { server as controlPlaneServer } from "../../apps/control-plane/src/server.js";
import {
  createLabCredential,
  type LabBinding,
} from "../../apps/lab-gateway/src/index.js";
import { MiniStackProvider } from "../../apps/lab-gateway/src/providers/ministack.js";
import { createLabGatewayServer } from "../../apps/lab-gateway/src/server.js";
import {
  createStartingStandardRuntime,
  finishStandardRuntime,
  markStandardRuntimeReady,
} from "../../packages/db/src/runtime-repository.js";
import { createWorkspace } from "../../packages/db/src/workspace-repository.js";
import {
  generateRuntimeTokenKeyPair,
} from "../../packages/runtime-auth/src/index.js";

const databaseUrl = process.env.DATABASE_URL;
const ministackEndpoint = process.env.MINISTACK_ENDPOINT;

test("Control Plane proxies a typed service operation through signed Lab Gateway auth", async (t) => {
  if (!databaseUrl || !ministackEndpoint) {
    t.skip("DATABASE_URL or MINISTACK_ENDPOINT is not configured");
    return;
  }

  const suffix = Date.now().toString();
  const identity = {
    subject: "service-proxy-" + suffix,
    roles: ["Learner"] as const,
  };
  const workspace = await createWorkspace({ databaseUrl, identity });
  const runtime = await createStartingStandardRuntime({
    databaseUrl,
    workspaceId: workspace.id,
  });

  const keys = generateRuntimeTokenKeyPair();
  const binding: LabBinding = {
    workspaceId: workspace.id,
    sessionId: runtime.sessionId,
    virtualAccountId: runtime.virtualAccountId,
    enabledRegions: runtime.enabledRegions,
    credential: createLabCredential({
      virtualAccountId: runtime.virtualAccountId,
      sessionId: runtime.sessionId,
    }),
  };
  const gateway = createLabGatewayServer({
    binding,
    platformPublicKeyPem: keys.publicKeyPem,
    providers: [new MiniStackProvider({ endpoint: ministackEndpoint })],
  });

  await new Promise<void>((resolve) => gateway.listen(0, "127.0.0.1", resolve));
  const gatewayAddress = gateway.address() as AddressInfo;

  await markStandardRuntimeReady({
    databaseUrl,
    runtimeId: runtime.runtimeId,
    providerRef: "task-local-proxy",
    privateEndpoint: "127.0.0.1:" + gatewayAddress.port,
  });

  process.env.PLATFORM_RUNTIME_PRIVATE_KEY_B64 = Buffer.from(
    keys.privateKeyPem,
  ).toString("base64");

  await new Promise<void>((resolve) =>
    controlPlaneServer.listen(0, "127.0.0.1", resolve),
  );
  const controlAddress = controlPlaneServer.address() as AddressInfo;
  const baseUrl = "http://127.0.0.1:" + controlAddress.port;
  const tableName = "proxy_" + suffix;

  try {
    const response = await fetch(
      baseUrl +
        "/api/v1/workspaces/" +
        workspace.id +
        "/services/dynamodb/CreateTable",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-prototype-user": identity.subject,
          "x-prototype-role": "Learner",
          "x-correlation-id": "corr-service-proxy",
        },
        body: JSON.stringify({
          virtualRegion: "ap-northeast-3",
          payload: { tableName },
        }),
      },
    );

    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      correlationId: string;
      result: { tableName: string; arn: string };
    };
    assert.equal(body.correlationId, "corr-service-proxy");
    assert.equal(body.result.tableName, tableName);
    assert.equal(
      body.result.arn,
      "arn:aws:dynamodb:ap-northeast-3:" +
        workspace.virtualAccountId +
        ":table/" +
        tableName,
    );

    const listResponse = await fetch(
      baseUrl +
        "/api/v1/workspaces/" +
        workspace.id +
        "/services/dynamodb/ListTables",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-prototype-user": identity.subject,
          "x-prototype-role": "Learner",
        },
        body: JSON.stringify({
          virtualRegion: "ap-northeast-3",
        }),
      },
    );
    assert.equal(listResponse.status, 200);
    const listed = (await listResponse.json()) as {
      result: { TableNames?: string[] };
    };
    assert.equal(listed.result.TableNames?.includes(tableName), true);
  } finally {
    delete process.env.PLATFORM_RUNTIME_PRIVATE_KEY_B64;
    await finishStandardRuntime({
      databaseUrl,
      workspaceId: workspace.id,
      runtimeId: runtime.runtimeId,
      finalStatus: "stopped",
    });
    await Promise.all([
      new Promise<void>((resolve, reject) =>
        gateway.close((error) => (error ? reject(error) : resolve())),
      ),
      new Promise<void>((resolve, reject) =>
        controlPlaneServer.close((error) =>
          error ? reject(error) : resolve(),
        ),
      ),
    ]);
  }
});
