import assert from "node:assert/strict";
import test from "node:test";

import {
  cleanupOrphanStandardSnapshots,
  cleanupOrphanStandardTasks,
  cleanupOrphanStandardVolumes,
} from "../../apps/operation-worker/src/standard-runtime-handler.js";
import type { StandardSnapshotManager } from "../../packages/runtime-control/src/standard-snapshot.js";
import type { StandardRuntimeProvisioner } from "../../packages/runtime-control/src/standard-runtime.js";

test("orphan cleanup stops only aged managed tasks absent from DB", async () => {
  const stopped: string[] = [];
  const provisioner: StandardRuntimeProvisioner = {
    async start() { return { taskArn: "unused" }; },
    async stop(taskArn) { stopped.push(taskArn); },
    async inspect(taskArn) { return { state: "running", taskArn }; },
    async listManagedTasks() {
      return [
        { taskArn: "task-active", createdAt: new Date("2026-10-07T09:00:00Z") },
        { taskArn: "task-new", createdAt: new Date("2026-10-07T09:55:00Z") },
        { taskArn: "task-orphan", createdAt: new Date("2026-10-07T09:00:00Z") },
      ];
    },
  };

  const result = await cleanupOrphanStandardTasks({
    provisioner,
    activeTaskArns: ["task-active"],
    now: new Date("2026-10-07T10:00:00Z"),
  });
  assert.deepEqual(stopped, ["task-orphan"]);
  assert.deepEqual(result, { inspected: 3, stopped: 1 });
});


test("orphan volume cleanup deletes only aged available managed volumes absent from active DB state", async () => {
  const deleted: string[] = [];
  const snapshotManager: StandardSnapshotManager = {
    async createSnapshot() { return { snapshotId: "unused" }; },
    async deleteSnapshot() {},
    async deleteVolume(volumeId) { deleted.push(volumeId); },
    async listManagedVolumes() {
      return [
        { volumeId: "vol-active", createTime: new Date("2026-10-07T09:00:00Z") },
        { volumeId: "vol-new", createTime: new Date("2026-10-07T09:55:00Z") },
        { volumeId: "vol-orphan", createTime: new Date("2026-10-07T09:00:00Z") },
      ];
    },
    async listManagedSnapshots() { return []; },
  };

  const result = await cleanupOrphanStandardVolumes({
    snapshotManager,
    activeVolumeIds: ["vol-active"],
    now: new Date("2026-10-07T10:00:00Z"),
  });

  assert.deepEqual(deleted, ["vol-orphan"]);
  assert.deepEqual(result, { inspected: 3, deleted: 1 });
});


test("orphan snapshot cleanup preserves protected and recent snapshots", async () => {
  const deleted: string[] = [];
  const snapshotManager: StandardSnapshotManager = {
    async createSnapshot() { return { snapshotId: "unused" }; },
    async deleteVolume() {},
    async deleteSnapshot(snapshotId) { deleted.push(snapshotId); },
    async listManagedVolumes() { return []; },
    async listManagedSnapshots() {
      return [
        {
          snapshotId: "snap-protected",
          labSnapshotId: "lab-protected",
          startTime: new Date("2026-10-07T08:00:00Z"),
          state: "completed",
        },
        {
          snapshotId: "snap-recent",
          labSnapshotId: "lab-failed-recent",
          startTime: new Date("2026-10-07T09:30:00Z"),
          state: "error",
        },
        {
          snapshotId: "snap-orphan",
          labSnapshotId: "lab-failed-old",
          startTime: new Date("2026-10-07T08:00:00Z"),
          state: "completed",
        },
      ];
    },
  };

  const result = await cleanupOrphanStandardSnapshots({
    snapshotManager,
    protectedLabSnapshotIds: ["lab-protected"],
    now: new Date("2026-10-07T10:00:00Z"),
  });

  assert.deepEqual(deleted, ["snap-orphan"]);
  assert.deepEqual(result, { inspected: 3, deleted: 1 });
});
