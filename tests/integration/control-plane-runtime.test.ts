import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";

import {
  executeStandardRuntimeOperation,
} from "../../apps/operation-worker/src/standard-runtime-handler.js";
import { server } from "../../apps/control-plane/src/server.js";
import type {
  StandardRuntimeInspection,
  StandardRuntimeProvisioner,
} from "../../packages/runtime-control/src/standard-runtime.js";
import {
  getActiveRuntimeForWorkspace,
} from "../../packages/db/src/runtime-repository.js";
import { generateRuntimeTokenKeyPair, signRuntimeToken } from "../../packages/runtime-auth/src/index.js";

const databaseUrl = process.env.DATABASE_URL;

class ApiFakeProvisioner implements StandardRuntimeProvisioner {
  async listManagedTasks() { return []; }
  stopped = false;

  async start() {
    return { taskArn: "task-api-prototype" };
  }

  async stop() {
    this.stopped = true;
  }

  async inspect(taskArn: string): Promise<StandardRuntimeInspection> {
    return {
      state: this.stopped ? "stopped" : "running",
      taskArn,
      privateIpv4Address: "10.30.2.30",
      stateVolumeId: "vol-api-runtime",
    };
  }
}

test("workspace start/stop API drives Standard Runtime lifecycle", async (t) => {
  if (!databaseUrl) {
    t.skip("DATABASE_URL is not configured");
    return;
  }

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const address = server.address() as AddressInfo;
    const baseUrl = "http://127.0.0.1:" + address.port;
    const authHeaders = {
      "content-type": "application/json",
      "x-prototype-user": "runtime-api-" + Date.now(),
      "x-prototype-role": "Learner",
    };

    const createResponse = await fetch(baseUrl + "/api/v1/workspaces", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ primaryVirtualRegion: "ap-northeast-1" }),
    });
    assert.equal(createResponse.status, 201);
    const created = (await createResponse.json()) as {
      workspace: { id: string };
    };
    const workspaceId = created.workspace.id;

    const startResponse = await fetch(
      baseUrl + "/api/v1/workspaces/" + workspaceId + "/start",
      {
        method: "POST",
        headers: {
          ...authHeaders,
          "idempotency-key": "api-start-1",
          "x-correlation-id": "corr-api-start",
        },
      },
    );
    assert.equal(startResponse.status, 202);
    const startBody = (await startResponse.json()) as {
      operationId: string;
      correlationId: string;
    };
    assert.equal(startBody.correlationId, "corr-api-start");

    const provisioner = new ApiFakeProvisioner();
    await executeStandardRuntimeOperation({
      databaseUrl,
      operationId: startBody.operationId,
      provisioner,
    });

    const active = await getActiveRuntimeForWorkspace({
      databaseUrl,
      workspaceId,
    });
    assert.equal(active?.providerRef, "task-api-prototype");
    assert.equal(active?.privateEndpoint, "10.30.2.30:8080");

    const relayKeys = generateRuntimeTokenKeyPair();
    const previousPrivateKey = process.env.PLATFORM_RUNTIME_PRIVATE_KEY_B64;
    process.env.PLATFORM_RUNTIME_PRIVATE_KEY_B64 = Buffer.from(relayKeys.privateKeyPem).toString("base64");
    try {
      const relayIdentity = {
        endpoint: "10.30.2.31:8080",
        workspaceId,
        sessionId: active!.sessionId,
        virtualAccountId: active!.virtualAccountId,
      };
      const relayResponse = await fetch(baseUrl + "/internal/runtime-admin/persist", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer " + signRuntimeToken({ privateKeyPem: relayKeys.privateKeyPem, ...relayIdentity }),
        },
        body: JSON.stringify(relayIdentity),
      });
      assert.equal(relayResponse.status, 409);
    } finally {
      if (previousPrivateKey === undefined) delete process.env.PLATFORM_RUNTIME_PRIVATE_KEY_B64;
      else process.env.PLATFORM_RUNTIME_PRIVATE_KEY_B64 = previousPrivateKey;
    }

    const stopResponse = await fetch(
      baseUrl + "/api/v1/workspaces/" + workspaceId + "/stop",
      {
        method: "POST",
        headers: {
          ...authHeaders,
          "idempotency-key": "api-stop-1",
          "x-correlation-id": "corr-api-stop",
        },
      },
    );
    assert.equal(stopResponse.status, 202);
    const stopBody = (await stopResponse.json()) as {
      operationId: string;
    };

    await executeStandardRuntimeOperation({
      databaseUrl,
      operationId: stopBody.operationId,
      provisioner,
    });

    assert.equal(provisioner.stopped, true);
    assert.equal(
      await getActiveRuntimeForWorkspace({ databaseUrl, workspaceId }),
      null,
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
