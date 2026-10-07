import assert from "node:assert/strict";
import test from "node:test";

import {
  createStartingStandardRuntime,
  finishStandardRuntime,
  getActiveRuntimeForWorkspace,
  markStandardRuntimeReady,
} from "../../packages/db/src/runtime-repository.js";
import { createWorkspace } from "../../packages/db/src/workspace-repository.js";

const databaseUrl = process.env.DATABASE_URL;

test("standard runtime persists one active session per workspace", async (t) => {
  if (!databaseUrl) {
    t.skip("DATABASE_URL is not configured");
    return;
  }

  const workspace = await createWorkspace({
    databaseUrl,
    identity: {
      subject: `runtime-${Date.now()}`,
      roles: ["Learner"],
    },
  });

  const runtime = await createStartingStandardRuntime({
    databaseUrl,
    workspaceId: workspace.id,
  });

  assert.equal(runtime.virtualAccountId, workspace.virtualAccountId);
  assert.deepEqual(runtime.enabledRegions, [
    "ap-northeast-1",
    "ap-northeast-3",
  ]);

  await assert.rejects(
    createStartingStandardRuntime({
      databaseUrl,
      workspaceId: workspace.id,
    }),
    /WORKSPACE_ALREADY_ACTIVE/,
  );

  await markStandardRuntimeReady({
    databaseUrl,
    runtimeId: runtime.runtimeId,
    providerRef: "arn:aws:ecs:ap-northeast-1:123456789012:task/prototype",
    privateEndpoint: "10.30.1.20:8080",
  });

  const active = await getActiveRuntimeForWorkspace({
    databaseUrl,
    workspaceId: workspace.id,
  });
  assert.equal(active?.runtimeStatus, "ready");
  assert.equal(active?.providerRef?.includes("task/prototype"), true);
  assert.equal(active?.privateEndpoint, "10.30.1.20:8080");

  await finishStandardRuntime({
    databaseUrl,
    workspaceId: workspace.id,
    runtimeId: runtime.runtimeId,
    finalStatus: "stopped",
  });

  assert.equal(
    await getActiveRuntimeForWorkspace({
      databaseUrl,
      workspaceId: workspace.id,
    }),
    null,
  );
});
