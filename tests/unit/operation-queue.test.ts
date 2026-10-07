import assert from "node:assert/strict";
import test from "node:test";

import { DeleteMessageCommand, ReceiveMessageCommand, SendMessageCommand } from "@aws-sdk/client-sqs";
import { SqsOperationQueue } from "../../apps/operation-worker/src/operation-queue.js";

test("SQS operation queue sends FIFO identity and acknowledges received messages", async () => {
  const commands: object[] = [];
  const queue = new SqsOperationQueue({
    queueUrl: "https://sqs.ap-northeast-1.amazonaws.com/123456789012/operations.fifo",
    client: {
      async send(command) {
        commands.push(command);
        if (command instanceof ReceiveMessageCommand) {
          return { Messages: [{ Body: JSON.stringify({ operationId: "operation-1" }), ReceiptHandle: "receipt-1" }] };
        }
        return {};
      },
    },
  });

  await queue.send({ body: { operationId: "operation-1" }, messageGroupId: "workspace-1", deduplicationId: "outbox-1" });
  assert.equal((commands[0] as SendMessageCommand).input.MessageGroupId, "workspace-1");
  assert.equal((commands[0] as SendMessageCommand).input.MessageDeduplicationId, "outbox-1");
  assert.deepEqual(await queue.receive(), [{ body: { operationId: "operation-1" }, receiptHandle: "receipt-1" }]);
  await queue.delete("receipt-1");
  assert.equal((commands[2] as DeleteMessageCommand).input.ReceiptHandle, "receipt-1");
});
