import assert from "node:assert/strict";
import test from "node:test";

import { processOperationMessages } from "../../apps/operation-worker/src/worker-cycle.js";

test("worker acknowledges a successfully executed operation", async () => {
  const executed: string[] = [];
  const deleted: string[] = [];
  const result = await processOperationMessages({
    inbox: {
      async receive() { return [{ body: { operationId: "operation-1" }, receiptHandle: "receipt-1" }]; },
      async delete(receipt) { deleted.push(receipt); },
    },
    async execute(operationId) { executed.push(operationId); },
  });
  assert.deepEqual(executed, ["operation-1"]);
  assert.deepEqual(deleted, ["receipt-1"]);
  assert.deepEqual(result, { processed: 1, failed: 0 });
});

test("worker leaves a failed operation unacknowledged for queue retry", async () => {
  const deleted: string[] = [];
  const result = await processOperationMessages({
    inbox: {
      async receive() { return [{ body: { operationId: "operation-2" }, receiptHandle: "receipt-2" }]; },
      async delete(receipt) { deleted.push(receipt); },
    },
    async execute() { throw new Error("runtime unavailable"); },
  });
  assert.deepEqual(deleted, []);
  assert.deepEqual(result, { processed: 0, failed: 1 });
});
