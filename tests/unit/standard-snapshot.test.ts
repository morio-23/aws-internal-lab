import assert from "node:assert/strict";
import test from "node:test";

import {
  CreateSnapshotCommand,
  DeleteSnapshotCommand,
  DeleteVolumeCommand,
  DescribeSnapshotsCommand,
  DescribeVolumesCommand,
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


test("Standard snapshot manager inventories only available managed volumes across pages", async () => {
  const manager = new AwsStandardSnapshotManager({
    client: {
      async send(command) {
        if (command instanceof DescribeVolumesCommand) {
          if (command.input.NextToken) {
            return {
              Volumes: [
                {
                  VolumeId: "vol-orphan-2",
                  CreateTime: new Date("2026-10-07T09:00:00Z"),
                },
              ],
            };
          }
          assert.deepEqual(command.input.Filters, [
            { Name: "tag:ManagedBy", Values: ["aws-internal-lab"] },
            { Name: "status", Values: ["available"] },
          ]);
          return {
            Volumes: [
              {
                VolumeId: "vol-orphan-1",
                CreateTime: new Date("2026-10-07T08:00:00Z"),
              },
              { VolumeId: undefined, CreateTime: new Date() },
            ],
            NextToken: "next",
          };
        }
        return {};
      },
    },
  });

  assert.deepEqual(await manager.listManagedVolumes(), [
    {
      volumeId: "vol-orphan-1",
      createTime: new Date("2026-10-07T08:00:00Z"),
    },
    {
      volumeId: "vol-orphan-2",
      createTime: new Date("2026-10-07T09:00:00Z"),
    },
  ]);
});


test("Standard snapshot manager deletes its managed snapshot after timeout", async () => {
  const deleted: string[] = [];
  const manager = new AwsStandardSnapshotManager({
    pollIntervalMs: 0,
    maxPollAttempts: 2,
    client: {
      async send(command) {
        if (command instanceof CreateSnapshotCommand) {
          return { SnapshotId: "snap-timeout" };
        }
        if (command instanceof DescribeSnapshotsCommand) {
          return { Snapshots: [{ State: "pending" }] };
        }
        if (command instanceof DeleteSnapshotCommand) {
          if (command.input.SnapshotId) deleted.push(command.input.SnapshotId);
          return {};
        }
        return {};
      },
    },
  });

  await assert.rejects(
    () =>
      manager.createSnapshot({
        volumeId: "vol-timeout",
        workspaceId: "workspace-timeout",
        snapshotId: "lab-snapshot-timeout",
      }),
    /EBS_SNAPSHOT_TIMEOUT/,
  );
  assert.deepEqual(deleted, ["snap-timeout"]);
});
