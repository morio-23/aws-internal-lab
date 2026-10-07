import assert from "node:assert/strict";
import test from "node:test";

import {
  CreateSnapshotCommand,
  DeleteSnapshotCommand,
  DeleteVolumeCommand,
  DescribeSnapshotsCommand,
} from "@aws-sdk/client-ec2";

import { AwsStandardSnapshotManager } from "../../packages/runtime-control/src/standard-snapshot.js";

test("Standard snapshot manager waits for EBS snapshot completion", async () => {
  const seen: object[] = [];
  let describes = 0;
  const manager = new AwsStandardSnapshotManager({
    pollIntervalMs: 0,
    maxPollAttempts: 3,
    client: {
      async send(command) {
        seen.push(command);
        if (command instanceof CreateSnapshotCommand) {
          return { SnapshotId: "snap-123" };
        }
        if (command instanceof DescribeSnapshotsCommand) {
          describes += 1;
          return {
            Snapshots: [
              { State: describes === 1 ? "pending" : "completed" },
            ],
          };
        }
        return {};
      },
    },
  });

  assert.deepEqual(
    await manager.createSnapshot({
      volumeId: "vol-123",
      workspaceId: "workspace-1",
      snapshotId: "lab-snapshot-1",
    }),
    { snapshotId: "snap-123" },
  );
  assert.equal(seen[0] instanceof CreateSnapshotCommand, true);
  assert.equal(describes, 2);
});

test("Standard snapshot manager deletes source volume and snapshot explicitly", async () => {
  const seen: object[] = [];
  const manager = new AwsStandardSnapshotManager({
    client: {
      async send(command) {
        seen.push(command);
        return {};
      },
    },
  });

  await manager.deleteVolume("vol-123");
  await manager.deleteSnapshot("snap-123");

  assert.equal(seen[0] instanceof DeleteVolumeCommand, true);
  assert.equal(seen[1] instanceof DeleteSnapshotCommand, true);
});
