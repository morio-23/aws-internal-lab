import assert from "node:assert/strict";
import test from "node:test";

import { runStandardWorkerCycle } from "../../apps/operation-worker/src/worker-cycle.js";
import type { OperationQueueMessage } from "../../apps/operation-worker/src/outbox-relay.js";
import { createLifecycleOperation } from "../../packages/db/src/lifecycle-repository.js";
import { getActiveRuntimeForWorkspace } from "../../packages/db/src/runtime-repository.js";
import { createWorkspace } from "../../packages/db/src/workspace-repository.js";
import type { SnapshotManifestStore } from "../../packages/runtime-control/src/snapshot-manifest.js";
import type { StandardSnapshotManager } from "../../packages/runtime-control/src/standard-snapshot.js";
import type { StandardRuntimeProvisioner } from "../../packages/runtime-control/src/standard-runtime.js";

const databaseUrl = process.env.DATABASE_URL;

test("outbox and worker cycle provision then stop the API-created runtime", async (t) => {
  if (!databaseUrl) { t.skip("DATABASE_URL is not configured"); return; }
  const identity = { subject: "worker-cycle-" + Date.now(), roles: ["Learner"] as const };
  const workspace = await createWorkspace({ databaseUrl, identity });
  const messages: Array<{ body: unknown; receiptHandle: string }> = [];
  const queue = {
    async send(message: OperationQueueMessage) {
      if ((message.body as { workspaceId?: string }).workspaceId === workspace.id) {
        messages.push({ body: message.body, receiptHandle: message.deduplicationId });
      }
    },
    async receive() { return messages.slice(0, 1); },
    async delete(receiptHandle: string) { messages.splice(messages.findIndex((message) => message.receiptHandle === receiptHandle), 1); },
  };
  let stopped = false;
  const provisioner: StandardRuntimeProvisioner = {
    async start() { return { taskArn: "task-worker-cycle" }; },
    async stop() { stopped = true; },
    async inspect(taskArn) {
      return stopped
        ? { state: "stopped" as const, taskArn }
        : { state: "running" as const, taskArn, privateIpv4Address: "10.30.4.10", stateVolumeId: "vol-worker-cycle" };
    },
    async listManagedTasks() { return []; },
  };
  const snapshotManager: StandardSnapshotManager = {
    async createSnapshot() { return { snapshotId: "snap-unused" }; },
    async deleteVolume() {},
    async deleteSnapshot() {},
    async listManagedVolumes() { return []; },
  };
  const manifestStore: SnapshotManifestStore = {
    async putManifest() { return { key: "unused", sha256: "unused" }; },
    async getManifest() { throw new Error("unused"); },
    async deleteManifest() {},
  };
  const cycle = () => runStandardWorkerCycle({ databaseUrl, queue, provisioner, snapshotManager, manifestStore });

  await createLifecycleOperation({ databaseUrl, workspaceId: workspace.id, idempotencyKey: "worker-start", operationType: "start", requestedBy: identity.subject, correlationId: "worker-start", requestHash: "worker-start" });
  const started = await cycle();
  assert.equal(started.processed, 1);
  assert.equal((await getActiveRuntimeForWorkspace({ databaseUrl, workspaceId: workspace.id }))?.providerRef, "task-worker-cycle");

  await createLifecycleOperation({ databaseUrl, workspaceId: workspace.id, idempotencyKey: "worker-stop", operationType: "stop", requestedBy: identity.subject, correlationId: "worker-stop", requestHash: "worker-stop" });
  const finished = await cycle();
  assert.equal(finished.processed, 1);
  assert.equal(stopped, true);
  assert.equal(await getActiveRuntimeForWorkspace({ databaseUrl, workspaceId: workspace.id }), null);
});
