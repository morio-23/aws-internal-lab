import assert from "node:assert/strict";
import test from "node:test";

import {
  assertOperationTransition,
  canTransitionOperation,
  isTerminalOperationStatus,
  retryDelayMs,
} from "../../packages/domain/src/lifecycle.js";

test("lifecycle state machine allows only explicit transitions", () => {
  assert.equal(canTransitionOperation("queued", "running"), true);
  assert.equal(canTransitionOperation("running", "succeeded"), true);
  assert.equal(canTransitionOperation("succeeded", "running"), false);
  assert.throws(() => assertOperationTransition("succeeded", "running"));
});

test("terminal statuses and retry backoff are bounded", () => {
  assert.equal(isTerminalOperationStatus("succeeded"), true);
  assert.equal(isTerminalOperationStatus("running"), false);
  assert.equal(retryDelayMs(0), 250);
  assert.equal(retryDelayMs(100), 30_000);
});
