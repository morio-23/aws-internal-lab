import assert from "node:assert/strict";
import test from "node:test";

import { createLabCredential, dispatchLabRequest, type LabBinding } from "../../apps/lab-gateway/src/index.js";
import { MiniStackProvider } from "../../apps/lab-gateway/src/providers/ministack.js";

const endpoint = process.env.MINISTACK_ENDPOINT;
const phase = process.env.SNAPSHOT_PROBE_PHASE;
const suffix = process.env.SNAPSHOT_PROBE_ID;

test("MiniStack state survives a local Standard Runtime volume restore", async (t) => {
  if (!endpoint || !phase || !suffix) {
    t.skip("MINISTACK_ENDPOINT, SNAPSHOT_PROBE_PHASE and SNAPSHOT_PROBE_ID are required");
    return;
  }
  assert.match(suffix, /^[a-z0-9-]+$/);
  assert.ok(phase === "write" || phase === "verify");

  const binding: LabBinding = {
    workspaceId: "snapshot-probe-" + suffix,
    sessionId: "snapshot-session-" + phase,
    virtualAccountId: "777777777777",
    enabledRegions: ["ap-northeast-1", "ap-northeast-3"],
    credential: createLabCredential({
      virtualAccountId: "777777777777",
      sessionId: "snapshot-session-" + phase,
    }),
  };
  const provider = new MiniStackProvider({ endpoint });
  const invoke = (serviceCode: string, operation: string, payload?: unknown) =>
    dispatchLabRequest({
      binding,
      request: {
        workspaceId: binding.workspaceId,
        sessionId: binding.sessionId,
        virtualAccountId: binding.virtualAccountId,
        virtualRegion: "ap-northeast-1",
        serviceCode,
        operation,
        ...(payload === undefined ? {} : { payload }),
        accessKeyId: binding.credential.accessKeyId,
        secretAccessKey: binding.credential.secretAccessKey,
        correlationId: "snapshot-probe-" + phase,
      },
      providers: [provider],
    });
  const bucketName = "phase0-snapshot-" + suffix;
  const tableName = "phase0_snapshot_" + suffix.replaceAll("-", "_");
  const queueName = "phase0-snapshot-" + suffix;

  if (phase === "write") {
    await invoke("s3", "CreateBucket", { bucketName });
    await invoke("s3", "PutObject", { bucketName, key: "state.txt", body: "saved-" + suffix });
    await invoke("dynamodb", "CreateTable", { tableName });
    await invoke("dynamodb", "PutItem", { tableName, item: { id: "1", value: "saved-" + suffix } });
    const queue = await invoke("sqs", "CreateQueue", { queueName }) as { queueUrl: string; arn: string };
    assert.equal(queue.arn, `arn:aws:sqs:ap-northeast-1:777777777777:${queueName}`);
    await invoke("sqs", "SendMessage", { queueUrl: queue.queueUrl, messageBody: "saved-" + suffix });
    return;
  }

  const object = await invoke("s3", "GetObject", { bucketName, key: "state.txt" }) as { body: string };
  assert.equal(object.body, "saved-" + suffix);
  const item = await invoke("dynamodb", "GetItem", { tableName, key: { id: "1" } }) as { item: { value: string } };
  assert.equal(item.item.value, "saved-" + suffix);
  const queues = await invoke("sqs", "ListQueues") as { QueueUrls?: string[] };
  const queueUrl = queues.QueueUrls?.find((url) => url.endsWith("/" + queueName));
  assert.ok(queueUrl);
  const received = await invoke("sqs", "ReceiveMessage", { queueUrl }) as { Messages?: Array<{ Body?: string }> };
  assert.equal(received.Messages?.[0]?.Body, "saved-" + suffix);
});
