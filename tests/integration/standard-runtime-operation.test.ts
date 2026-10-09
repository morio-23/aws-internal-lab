import assert from "node:assert/strict";
import test from "node:test";

import {
  executeStandardRuntimeOperation,
  reconcileStandardRuntimes,
} from "../../apps/operation-worker/src/standard-runtime-handler.js";
import {
  createLifecycleOperation,
} from "../../packages/db/src/lifecycle-repository.js";
import {
  getActiveRuntimeForWorkspace,
} from "../../packages/db/src/runtime-repository.js";
import { createWorkspace } from "../../packages/db/src/workspace-repository.js";
import type {
  StandardRuntimeInspection,
  StandardRuntimeProvisioner,
} from "../../packages/runtime-control/src/standard-runtime.js";

const databaseUrl = process.env.DATABASE_URL;

class FakeProvisioner implements StandardRuntimeProvisioner {
  async listManagedTasks() { return []; }
  readonly stopped: string[] = [];
  inspection: StandardRuntimeInspection = {
    state: "running",
    taskArn: "task-prototype",
    privateIpv4Address: "10.30.1.20",
    stateVolumeId: "vol-test-runtime",
  };

  async start() {
    return { taskArn: "task-prototype" };
  }

  async stop(taskArn: string) {
    this.stopped.push(taskArn);
    this.inspection = {
      state: "stopped",
      taskArn,
      stoppedReason: "test stop",
    };
  }

  async inspect(taskArn: string) {
    return { ...this.inspection, taskArn };
  }
}

test("start and stop lifecycle operations provision and clean Standard Runtime", async (t) => {
  if (!databaseUrl) {
    t.skip("DATABASE_URL is not configured");
    return;
  }

  const identity = {
    subject: "runtime-operation-" + Date.now(),
    roles: ["Learner"] as const,
  };
  const workspace = await createWorkspace({ databaseUrl, identity });
  const provisioner = new FakeProvisioner();

  const start = await createLifecycleOperation({
    databaseUrl,
    workspaceId: workspace.id,
    idempotencyKey: "start-1",
    operationType: "start",
    requestedBy: identity.subject,
    correlationId: "corr-start",
    requestHash: "hash-start",
  });

  await executeStandardRuntimeOperation({
    databaseUrl,
    operationId: start.operation.id,
    provisioner,
  });

  const active = await getActiveRuntimeForWorkspace({
    databaseUrl,
    workspaceId: workspace.id,
  });
  assert.equal(active?.runtimeStatus, "ready");
  assert.equal(active?.providerRef, "task-prototype");
  assert.equal(active?.privateEndpoint, "10.30.1.20:8080");

  const stop = await createLifecycleOperation({
    databaseUrl,
    workspaceId: workspace.id,
    idempotencyKey: "stop-1",
    operationType: "stop",
    requestedBy: identity.subject,
    correlationId: "corr-stop",
    requestHash: "hash-stop",
  });

  await executeStandardRuntimeOperation({
    databaseUrl,
    operationId: stop.operation.id,
    provisioner,
  });

  assert.deepEqual(provisioner.stopped, ["task-prototype"]);
  assert.equal(
    await getActiveRuntimeForWorkspace({
      databaseUrl,
      workspaceId: workspace.id,
    }),
    null,
  );
});

test("reconciler marks an externally stopped Standard Runtime as failed", async (t) => {
  if (!databaseUrl) {
    t.skip("DATABASE_URL is not configured");
    return;
  }

  const identity = {
    subject: "runtime-reconcile-" + Date.now(),
    roles: ["Learner"] as const,
  };
  const workspace = await createWorkspace({ databaseUrl, identity });
  const provisioner = new FakeProvisioner();

  const start = await createLifecycleOperation({
    databaseUrl,
    workspaceId: workspace.id,
    idempotencyKey: "start-1",
    operationType: "start",
    requestedBy: identity.subject,
    correlationId: "corr-reconcile",
    requestHash: "hash-reconcile",
  });

  await executeStandardRuntimeOperation({
    databaseUrl,
    operationId: start.operation.id,
    provisioner,
  });

  provisioner.inspection = {
    state: "stopped",
    taskArn: "task-prototype",
    stoppedReason: "simulated crash",
  };

  const result = await reconcileStandardRuntimes({
    databaseUrl,
    provisioner,
  });

  assert.equal(result.failed >= 1, true);
  assert.equal(
    await getActiveRuntimeForWorkspace({
      databaseUrl,
      workspaceId: workspace.id,
    }),
    null,
  );
});
