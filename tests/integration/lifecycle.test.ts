import assert from "node:assert/strict";
import test from "node:test";

import { relayOutboxOnce, type OperationQueue } from "../../apps/operation-worker/src/outbox-relay.js";
import {
  createLifecycleOperation,
  findStaleOperations,
  listPendingOutbox,
  setOperationStatus,
} from "../../packages/db/src/lifecycle-repository.js";
import { createWorkspace } from "../../packages/db/src/workspace-repository.js";

const databaseUrl = process.env.DATABASE_URL;

test("lifecycle operation is idempotent and workspace mutations are serialized", async (t) => {
  if (!databaseUrl) {
    t.skip("DATABASE_URL is not configured");
    return;
  }

  const identity = {
    subject: `lifecycle-${Date.now()}`,
    roles: ["Learner"] as const,
  };
  const workspace = await createWorkspace({ databaseUrl, identity });

  const first = await createLifecycleOperation({
    databaseUrl,
    workspaceId: workspace.id,
    idempotencyKey: "suspend-1",
    operationType: "suspend",
    requestedBy: identity.subject,
    correlationId: "corr-1",
    requestHash: "hash-1",
  });
  assert.equal(first.created, true);

  const duplicate = await createLifecycleOperation({
    databaseUrl,
    workspaceId: workspace.id,
    idempotencyKey: "suspend-1",
    operationType: "suspend",
    requestedBy: identity.subject,
    correlationId: "corr-1",
    requestHash: "hash-1",
  });
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.operation.id, first.operation.id);

  await assert.rejects(
    createLifecycleOperation({
      databaseUrl,
      workspaceId: workspace.id,
      idempotencyKey: "suspend-1",
      operationType: "suspend",
      requestedBy: identity.subject,
      correlationId: "corr-2",
      requestHash: "different-hash",
    }),
    /IDEMPOTENCY_KEY_CONFLICT/,
  );

  await assert.rejects(
    createLifecycleOperation({
      databaseUrl,
      workspaceId: workspace.id,
      idempotencyKey: "resume-1",
      operationType: "resume",
      requestedBy: identity.subject,
      correlationId: "corr-3",
      requestHash: "hash-3",
    }),
    /WORKSPACE_BUSY/,
  );

  await setOperationStatus({
    databaseUrl,
    operationId: first.operation.id,
    status: "succeeded",
  });

  const next = await createLifecycleOperation({
    databaseUrl,
    workspaceId: workspace.id,
    idempotencyKey: "resume-1",
    operationType: "resume",
    requestedBy: identity.subject,
    correlationId: "corr-4",
    requestHash: "hash-4",
  });
  assert.equal(next.created, true);

  const stale = await findStaleOperations({
    databaseUrl,
    olderThan: new Date(Date.now() + 1_000),
  });
  assert.equal(stale.some((item) => item.id === next.operation.id), true);

  await setOperationStatus({
    databaseUrl,
    operationId: next.operation.id,
    status: "cancelled",
  });
});

test("outbox remains pending after publish failure and succeeds on retry", async (t) => {
  if (!databaseUrl) {
    t.skip("DATABASE_URL is not configured");
    return;
  }

  const identity = {
    subject: `outbox-${Date.now()}`,
    roles: ["Learner"] as const,
  };
  const workspace = await createWorkspace({ databaseUrl, identity });
  const operation = await createLifecycleOperation({
    databaseUrl,
    workspaceId: workspace.id,
    idempotencyKey: "start-1",
    operationType: "start",
    requestedBy: identity.subject,
    correlationId: "corr-outbox",
    requestHash: "hash-outbox",
  });

  let shouldFail = true;
  const sent: { messageGroupId: string; deduplicationId: string }[] = [];

  const queue: OperationQueue = {
    async send(message) {
      if (shouldFail) throw new Error("temporary queue failure");
      sent.push({
        messageGroupId: message.messageGroupId,
        deduplicationId: message.deduplicationId,
      });
    },
  };

  const failed = await relayOutboxOnce({ databaseUrl, queue });
  assert.equal(failed.failed >= 1, true);

  const pendingAfterFailure = await listPendingOutbox({ databaseUrl });
  assert.equal(
    pendingAfterFailure.some((event) => event.aggregate_id === workspace.id),
    true,
  );

  shouldFail = false;
  const succeeded = await relayOutboxOnce({ databaseUrl, queue });
  assert.equal(succeeded.published >= 1, true);
  assert.equal(sent.some((item) => item.messageGroupId === workspace.id), true);

  await setOperationStatus({
    databaseUrl,
    operationId: operation.operation.id,
    status: "failed",
    errorCode: "TEST_COMPLETE",
  });
});
