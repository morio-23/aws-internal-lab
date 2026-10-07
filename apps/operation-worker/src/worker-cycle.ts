import type { SnapshotManifestStore } from "../../../packages/runtime-control/src/snapshot-manifest.js";
import type { StandardSnapshotManager } from "../../../packages/runtime-control/src/standard-snapshot.js";
import type { StandardRuntimeProvisioner } from "../../../packages/runtime-control/src/standard-runtime.js";
import { relayOutboxOnce, type OperationQueue } from "./outbox-relay.js";
import type { OperationInbox } from "./operation-queue.js";
import { executeStandardRuntimeOperation, reconcileStandardRuntimes } from "./standard-runtime-handler.js";

export async function processOperationMessages(input: {
  inbox: OperationInbox;
  execute(operationId: string): Promise<void>;
}): Promise<{ processed: number; failed: number }> {
  const messages = await input.inbox.receive();
  let processed = 0;
  let failed = 0;
  for (const message of messages) {
    try {
      const operationId = (message.body as { operationId?: unknown } | null)?.operationId;
      if (typeof operationId !== "string" || !operationId) throw new Error("INVALID_OPERATION_QUEUE_MESSAGE");
      await input.execute(operationId);
      await input.inbox.delete(message.receiptHandle);
      processed += 1;
    } catch {
      failed += 1;
    }
  }
  return { processed, failed };
}

export async function runStandardWorkerCycle(input: {
  databaseUrl: string;
  queue: OperationQueue & OperationInbox;
  provisioner: StandardRuntimeProvisioner;
  snapshotManager: StandardSnapshotManager;
  manifestStore: SnapshotManifestStore;
}): Promise<{
  published: number;
  processed: number;
  failed: number;
  orphanTasksStopped: number;
  orphanVolumesDeleted: number;
}> {
  const outbox = await relayOutboxOnce({ databaseUrl: input.databaseUrl, queue: input.queue });
  const operations = await processOperationMessages({
    inbox: input.queue,
    execute: (operationId) => executeStandardRuntimeOperation({
      databaseUrl: input.databaseUrl,
      operationId,
      provisioner: input.provisioner,
      snapshotManager: input.snapshotManager,
      manifestStore: input.manifestStore,
    }),
  });
  const reconciliation = await reconcileStandardRuntimes({
    databaseUrl: input.databaseUrl,
    provisioner: input.provisioner,
    snapshotManager: input.snapshotManager,
  });
  return {
    published: outbox.published,
    processed: operations.processed,
    failed: outbox.failed + operations.failed,
    orphanTasksStopped: reconciliation.orphanTasksStopped,
    orphanVolumesDeleted: reconciliation.orphanVolumesDeleted,
  };
}
