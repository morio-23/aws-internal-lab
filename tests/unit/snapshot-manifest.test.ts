import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";

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

test("snapshot manifest store rejects missing checksum metadata", async () => {
  const store = new S3SnapshotManifestStore({
    bucket: "snapshot-bucket",
    client: {
      async send() {
        return {
          Body: { async transformToString() { return "{}"; } },
          Metadata: {},
        };
      },
    },
  });
  await assert.rejects(store.getManifest("snapshots/workspace/snapshot/manifest.json"),
    /SNAPSHOT_MANIFEST_CHECKSUM_MISSING/);
});

test("snapshot manifest store rejects a checksummed unsupported format", async () => {
  const body = JSON.stringify({ snapshotFormatVersion: 2, runtimeType: "standard" });
  const store = new S3SnapshotManifestStore({
    bucket: "snapshot-bucket",
    client: {
      async send() {
        return {
          Body: { async transformToString() { return body; } },
          Metadata: { sha256: createHash("sha256").update(body).digest("hex") },
        };
      },
    },
  });
  await assert.rejects(store.getManifest("snapshots/workspace/snapshot/manifest.json"),
    /SNAPSHOT_MANIFEST_INVALID/);
});

test("snapshot manifest store rejects body tampering", async () => {
  const store = new S3SnapshotManifestStore({
    bucket: "snapshot-bucket",
    client: {
      async send() {
        return {
          Body: { async transformToString() { return '{"tampered":true}'; } },
          Metadata: { sha256: "0".repeat(64) },
        };
      },
    },
  });
  await assert.rejects(store.getManifest("snapshots/workspace/snapshot/manifest.json"),
    /SNAPSHOT_MANIFEST_CHECKSUM_MISMATCH/);
});
