import {
  listPendingOutbox,
  markOutboxFailed,
  markOutboxPublished,
} from "../../../packages/db/src/lifecycle-repository.js";

export type OperationQueueMessage = {
  body: unknown;
  messageGroupId: string;
  deduplicationId: string;
};

export interface OperationQueue {
  send(message: OperationQueueMessage): Promise<void>;
}

export async function relayOutboxOnce(input: {
  databaseUrl: string;
  queue: OperationQueue;
  limit?: number;
}): Promise<{ published: number; failed: number }> {
  const events = await listPendingOutbox({
    databaseUrl: input.databaseUrl,
    ...(input.limit ? { limit: input.limit } : {}),
  });

  let published = 0;
  let failed = 0;

  for (const event of events) {
    try {
      const body =
        typeof event.payload_json === "string"
          ? JSON.parse(event.payload_json)
          : event.payload_json;

      await input.queue.send({
        body,
        messageGroupId: event.aggregate_id,
        deduplicationId: event.id,
      });
      await markOutboxPublished({
        databaseUrl: input.databaseUrl,
        eventId: event.id,
      });
      published += 1;
    } catch (error) {
      await markOutboxFailed({
        databaseUrl: input.databaseUrl,
        eventId: event.id,
        error: error instanceof Error ? error.message : "queue publish failed",
      });
      failed += 1;
    }
  }

  return { published, failed };
}
