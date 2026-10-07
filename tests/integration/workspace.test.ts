import assert from "node:assert/strict";
import test from "node:test";

import {
  createWorkspace,
  getWorkspaceForOwner,
  listWorkspacesForOwner,
} from "../../packages/db/src/workspace-repository.js";

const databaseUrl = process.env.DATABASE_URL;

test("workspace keeps a 12 digit virtual account and Tokyo/Osaka region model", async (t) => {
  if (!databaseUrl) {
    t.skip("DATABASE_URL is not configured");
    return;
  }

  const suffix = Date.now().toString();
  const userA = {
    subject: `workspace-a-${suffix}`,
    roles: ["Learner"] as const,
  };
  const userB = {
    subject: `workspace-b-${suffix}`,
    roles: ["Learner"] as const,
  };

  const tokyo = await createWorkspace({
    databaseUrl,
    identity: userA,
    primaryVirtualRegion: "ap-northeast-1",
  });
  const osaka = await createWorkspace({
    databaseUrl,
    identity: userB,
    primaryVirtualRegion: "ap-northeast-3",
  });

  assert.match(tokyo.virtualAccountId, /^\d{12}$/);
  assert.match(osaka.virtualAccountId, /^\d{12}$/);
  assert.notEqual(tokyo.virtualAccountId, osaka.virtualAccountId);
  assert.equal(tokyo.primaryVirtualRegion, "ap-northeast-1");
  assert.equal(osaka.primaryVirtualRegion, "ap-northeast-3");
  assert.deepEqual(tokyo.enabledRegions, ["ap-northeast-1", "ap-northeast-3"]);

  const userAWorkspaces = await listWorkspacesForOwner({
    databaseUrl,
    ownerSubject: userA.subject,
  });
  assert.equal(userAWorkspaces.some((item) => item.id === tokyo.id), true);
  assert.equal(userAWorkspaces.some((item) => item.id === osaka.id), false);

  assert.equal(
    await getWorkspaceForOwner({
      databaseUrl,
      workspaceId: tokyo.id,
      ownerSubject: userB.subject,
    }),
    null,
  );
});

test("workspace rejects unsupported virtual regions", async (t) => {
  if (!databaseUrl) {
    t.skip("DATABASE_URL is not configured");
    return;
  }

  await assert.rejects(
    createWorkspace({
      databaseUrl,
      identity: {
        subject: `workspace-invalid-${Date.now()}`,
        roles: ["Learner"],
      },
      primaryVirtualRegion: "us-east-1",
    }),
    /Unsupported virtual region/,
  );
});
