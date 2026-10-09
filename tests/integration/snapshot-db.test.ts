import assert from "node:assert/strict";
import test from "node:test";

import {
  createStandardSnapshotRecord,
  getAvailableSnapshotForWorkspace,
  listProtectedStandardSnapshotIds,
  markSnapshotFailed,
  markSnapshotRestored,
  markStandardSnapshotAvailable,
} from "../../packages/db/src/snapshot-repository.js";
import { createStartingStandardRuntime } from "../../packages/db/src/runtime-repository.js";
import { createWorkspace } from "../../packages/db/src/workspace-repository.js";

const databaseUrl = process.env.DATABASE_URL;

test("Standard snapshot record publishes atomically and becomes current workspace snapshot", async (t) => {
  if (!databaseUrl) {
    t.skip("DATABASE_URL is not configured");
    return;
  }

  const workspace = await createWorkspace({
    databaseUrl,
    identity: {
      subject: "snapshot-db-" + Date.now(),
      roles: ["Learner"],
    },
  });
  const runtime = await createStartingStandardRuntime({
    databaseUrl,
    workspaceId: workspace.id,
  });

  const snapshot = await createStandardSnapshotRecord({
    databaseUrl,
    workspaceId: workspace.id,
    sourceSessionId: runtime.sessionId,
  });
  assert.equal(snapshot.status, "creating");

  await markStandardSnapshotAvailable({
    databaseUrl,
    snapshotId: snapshot.id,
    providerSnapshotRef: "snap-123",
    manifestKey:
      "snapshots/" + workspace.id + "/" + snapshot.id + "/manifest.json",
  });

  const available = await getAvailableSnapshotForWorkspace({
    databaseUrl,
    workspaceId: workspace.id,
    snapshotId: snapshot.id,
  });
  assert.equal(available?.providerSnapshotRef, "snap-123");
  assert.equal(available?.status, "available");

  await markSnapshotRestored({
    databaseUrl,
    snapshotId: snapshot.id,
  });

  const failedSnapshot = await createStandardSnapshotRecord({
    databaseUrl,
    workspaceId: workspace.id,
    sourceSessionId: runtime.sessionId,
  });
  await markSnapshotFailed({
    databaseUrl,
    snapshotId: failedSnapshot.id,
    errorCode: "TEST_FAILURE",
  });

  const creatingSnapshot = await createStandardSnapshotRecord({
    databaseUrl,
    workspaceId: workspace.id,
    sourceSessionId: runtime.sessionId,
  });

  const protectedIds = await listProtectedStandardSnapshotIds({
    databaseUrl,
    creatingNewerThan: new Date(Date.now() - 60 * 60_000),
  });
  assert.ok(protectedIds.includes(snapshot.id));
  assert.ok(protectedIds.includes(creatingSnapshot.id));
  assert.equal(protectedIds.includes(failedSnapshot.id), false);
});
