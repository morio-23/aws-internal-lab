import assert from "node:assert/strict";
import test from "node:test";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

import {
  S3SnapshotManifestStore,
  type StandardSnapshotManifest,
} from "../../packages/runtime-control/src/snapshot-manifest.js";

test("snapshot manifest store writes deterministic key and validates checksum", async () => {
  let storedBody = "";
  let storedSha = "";
  const seen: object[] = [];
  const store = new S3SnapshotManifestStore({
    bucket: "snapshot-bucket",
    client: {
      async send(command) {
        seen.push(command);
        if (command instanceof PutObjectCommand) {
          storedBody = String(command.input.Body);
          storedSha = command.input.Metadata?.sha256 ?? "";
          return {};
        }
        if (command instanceof GetObjectCommand) {
          return {
            Body: {
              async transformToString() {
                return storedBody;
              },
            },
            Metadata: { sha256: storedSha },
          };
        }
        return {};
      },
    },
  });

  const manifest: StandardSnapshotManifest = {
    snapshotFormatVersion: 1,
    runtimeType: "standard",
    payloadType: "ebs-snapshot",
    snapshotId: "snapshot-1",
    workspaceId: "workspace-1",
    sourceSessionId: "session-1",
    ebsSnapshotId: "snap-123",
    consistencyLevel: "application-consistent",
    virtualRegions: ["ap-northeast-1", "ap-northeast-3"],
    createdAt: "2026-10-07T00:00:00.000Z",
  };

  const written = await store.putManifest(manifest);
  assert.equal(
    written.key,
    "snapshots/workspace-1/snapshot-1/manifest.json",
  );
  assert.match(written.sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(await store.getManifest(written.key), manifest);

  await store.deleteManifest(written.key);
  assert.equal(seen.some((item) => item instanceof DeleteObjectCommand), true);
});
