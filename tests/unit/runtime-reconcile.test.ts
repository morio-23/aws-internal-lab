import assert from "node:assert/strict";
import test from "node:test";

import { cleanupOrphanStandardTasks } from "../../apps/operation-worker/src/standard-runtime-handler.js";
import type { StandardRuntimeProvisioner } from "../../packages/runtime-control/src/standard-runtime.js";

test("orphan cleanup stops only aged managed tasks absent from DB", async () => {
  const stopped: string[] = [];
  const provisioner: StandardRuntimeProvisioner = {
    async start() { return { taskArn: "unused" }; },
    async stop(taskArn) { stopped.push(taskArn); },
    async inspect(taskArn) { return { state: "running", taskArn }; },
    async listManagedTasks() {
      return [
        { taskArn: "task-active", createdAt: new Date("2026-10-07T09:00:00Z") },
        { taskArn: "task-new", createdAt: new Date("2026-10-07T09:55:00Z") },
        { taskArn: "task-orphan", createdAt: new Date("2026-10-07T09:00:00Z") },
      ];
    },
  };

  const result = await cleanupOrphanStandardTasks({
    provisioner,
    activeTaskArns: ["task-active"],
    now: new Date("2026-10-07T10:00:00Z"),
  });
  assert.deepEqual(stopped, ["task-orphan"]);
  assert.deepEqual(result, { inspected: 3, stopped: 1 });
});
