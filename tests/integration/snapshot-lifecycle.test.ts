import assert from "node:assert/strict";
import test from "node:test";

import {
  executeStandardRuntimeOperation,
} from "../../apps/operation-worker/src/standard-runtime-handler.js";
import {
  createLifecycleOperation,
} from "../../packages/db/src/lifecycle-repository.js";
import {
  getAvailableSnapshotForWorkspace,
} from "../../packages/db/src/snapshot-repository.js";
import {
  getActiveRuntimeForWorkspace,
} from "../../packages/db/src/runtime-repository.js";
import { createWorkspace } from "../../packages/db/src/workspace-repository.js";
import type {
  SnapshotManifestStore,
  StandardSnapshotManifest,
} from "../../packages/runtime-control/src/snapshot-manifest.js";
import type {
  StandardSnapshotManager,
} from "../../packages/runtime-control/src/standard-snapshot.js";
import type {
  StandardRuntimeIdentity,
  StandardRuntimeInspection,
  StandardRuntimeProvisioner,
} from "../../packages/runtime-control/src/standard-runtime.js";

const databaseUrl = process.env.DATABASE_URL;

class SnapshotFakeProvisioner implements StandardRuntimeProvisioner {
  generation = 0;
  currentTaskArn: string | null = null;
  currentVolumeId: string | null = null;
  stopped = false;
  readonly restoreSnapshotIds: Array<string | undefined> = [];

  async start(identity: StandardRuntimeIdentity) {
    this.generation += 1;
    this.currentTaskArn = "task-snapshot-" + this.generation;
    this.currentVolumeId = "vol-snapshot-" + this.generation;
    this.stopped = false;
    this.restoreSnapshotIds.push(identity.restoreSnapshotId);
    return { taskArn: this.currentTaskArn };
  }

  async stop() {
    this.stopped = true;
  }

  async inspect(taskArn: string): Promise<StandardRuntimeInspection> {
    if (this.stopped) {
      return {
        state: "stopped",
        taskArn,
        stoppedReason: "snapshot suspend",
      };
    }

    return {
      state: "running",
      taskArn,
      privateIpv4Address: "10.30.10." + (20 + this.generation),
      stateVolumeId: this.currentVolumeId ?? undefined,
    };
  }
}

class SnapshotFakeManager implements StandardSnapshotManager {
  readonly createdFromVolumes: string[] = [];
  readonly deletedVolumes: string[] = [];
  readonly deletedSnapshots: string[] = [];

  async createSnapshot(input: {
    volumeId: string;
    workspaceId: string;
    snapshotId: string;
  }) {
    this.createdFromVolumes.push(input.volumeId);
    return { snapshotId: "snap-phase0-001" };
  }

  async deleteVolume(volumeId: string) {
    this.deletedVolumes.push(volumeId);
  }

  async deleteSnapshot(snapshotId: string) {
    this.deletedSnapshots.push(snapshotId);
  }
}

class MemoryManifestStore implements SnapshotManifestStore {
  readonly manifests = new Map<string, StandardSnapshotManifest>();

  async putManifest(manifest: StandardSnapshotManifest) {
    const key =
      "snapshots/" +
      manifest.workspaceId +
      "/" +
      manifest.snapshotId +
      "/manifest.json";
    this.manifests.set(key, manifest);
    return { key, sha256: "0".repeat(64) };
  }

  async getManifest(key: string) {
    const manifest = this.manifests.get(key);
    if (!manifest) throw new Error("SNAPSHOT_MANIFEST_MISSING");
    return manifest;
  }

  async deleteManifest(key: string) {
    this.manifests.delete(key);
  }
}

test("Standard Runtime suspends to EBS snapshot and resumes into a new task", async (t) => {
  if (!databaseUrl) {
    t.skip("DATABASE_URL is not configured");
    return;
  }

  const identity = {
    subject: "snapshot-lifecycle-" + Date.now(),
    roles: ["Learner"] as const,
  };
  const workspace = await createWorkspace({ databaseUrl, identity });
  const provisioner = new SnapshotFakeProvisioner();
  const snapshotManager = new SnapshotFakeManager();
  const manifestStore = new MemoryManifestStore();

  const start = await createLifecycleOperation({
    databaseUrl,
    workspaceId: workspace.id,
    idempotencyKey: "snapshot-start",
    operationType: "start",
    requestedBy: identity.subject,
    correlationId: "corr-snapshot-start",
    requestHash: "hash-snapshot-start",
  });
  await executeStandardRuntimeOperation({
    databaseUrl,
    operationId: start.operation.id,
    provisioner,
  });

  const beforeSuspend = await getActiveRuntimeForWorkspace({
    databaseUrl,
    workspaceId: workspace.id,
  });
  assert.equal(beforeSuspend?.providerRef, "task-snapshot-1");
  assert.equal(beforeSuspend?.stateVolumeRef, "vol-snapshot-1");
  const virtualAccountId = beforeSuspend?.virtualAccountId;
  assert.ok(virtualAccountId);

  const suspend = await createLifecycleOperation({
    databaseUrl,
    workspaceId: workspace.id,
    idempotencyKey: "snapshot-suspend",
    operationType: "suspend",
    requestedBy: identity.subject,
    correlationId: "corr-snapshot-suspend",
    requestHash: "hash-snapshot-suspend",
  });
  await executeStandardRuntimeOperation({
    databaseUrl,
    operationId: suspend.operation.id,
    provisioner,
    snapshotManager,
    manifestStore,
    now: () => new Date("2026-10-07T10:00:00.000Z"),
  });

  assert.equal(
    await getActiveRuntimeForWorkspace({
      databaseUrl,
      workspaceId: workspace.id,
    }),
    null,
  );
  assert.deepEqual(snapshotManager.createdFromVolumes, ["vol-snapshot-1"]);
  assert.deepEqual(snapshotManager.deletedVolumes, ["vol-snapshot-1"]);

  const snapshot = await getAvailableSnapshotForWorkspace({
    databaseUrl,
    workspaceId: workspace.id,
  });
  assert.equal(snapshot?.providerSnapshotRef, "snap-phase0-001");
  assert.equal(snapshot?.consistencyLevel, "application-consistent");
  assert.ok(snapshot?.manifestKey);

  const resume = await createLifecycleOperation({
    databaseUrl,
    workspaceId: workspace.id,
    idempotencyKey: "snapshot-resume",
    operationType: "resume",
    requestedBy: identity.subject,
    correlationId: "corr-snapshot-resume",
    requestHash: "hash-snapshot-resume",
  });
  await executeStandardRuntimeOperation({
    databaseUrl,
    operationId: resume.operation.id,
    provisioner,
    snapshotManager,
    manifestStore,
  });

  const resumed = await getActiveRuntimeForWorkspace({
    databaseUrl,
    workspaceId: workspace.id,
  });
  assert.equal(resumed?.providerRef, "task-snapshot-2");
  assert.equal(resumed?.stateVolumeRef, "vol-snapshot-2");
  assert.equal(resumed?.virtualAccountId, virtualAccountId);
  assert.deepEqual(provisioner.restoreSnapshotIds, [
    undefined,
    "snap-phase0-001",
  ]);
});
