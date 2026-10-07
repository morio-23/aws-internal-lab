import assert from "node:assert/strict";
import test from "node:test";

import {
  createLabCredential,
  dispatchLabRequest,
  type LabBinding,
} from "../../apps/lab-gateway/src/index.js";
import {
  MiniStackProvider,
} from "../../apps/lab-gateway/src/providers/ministack.js";

const endpoint = process.env.MINISTACK_ENDPOINT;

function createBinding(
  accountId: string,
  suffix: string,
): LabBinding {
  const sessionId = "session-" + suffix;
  return {
    workspaceId: "workspace-" + suffix,
    sessionId,
    virtualAccountId: accountId,
    enabledRegions: ["ap-northeast-1", "ap-northeast-3"],
    credential: createLabCredential({
      virtualAccountId: accountId,
      sessionId,
    }),
  };
}

function request(
  binding: LabBinding,
  input: {
    region: "ap-northeast-1" | "ap-northeast-3";
    serviceCode: string;
    operation: string;
    payload?: unknown;
  },
) {
  return {
    workspaceId: binding.workspaceId,
    sessionId: binding.sessionId,
    virtualAccountId: binding.virtualAccountId,
    virtualRegion: input.region,
    serviceCode: input.serviceCode,
    operation: input.operation,
    ...(input.payload === undefined ? {} : { payload: input.payload }),
    accessKeyId: binding.credential.accessKeyId,
    secretAccessKey: binding.credential.secretAccessKey,
    correlationId: "corr-ministack-integration",
  };
}

test("MiniStack vertical slice preserves account and Tokyo/Osaka isolation", async (t) => {
  if (!endpoint) {
    t.skip("MINISTACK_ENDPOINT is not configured");
    return;
  }

  const suffix = Date.now().toString();
  const primary = createBinding("111111111111", "a-" + suffix);
  const secondaryAccount = createBinding("222222222222", "b-" + suffix);
  const provider = new MiniStackProvider({ endpoint });

  const bucketName = "lab-" + suffix;
  await dispatchLabRequest({
    binding: primary,
    request: request(primary, {
      region: "ap-northeast-1",
      serviceCode: "s3",
      operation: "CreateBucket",
      payload: { bucketName },
    }),
    providers: [provider],
  });
  await dispatchLabRequest({
    binding: primary,
    request: request(primary, {
      region: "ap-northeast-1",
      serviceCode: "s3",
      operation: "PutObject",
      payload: {
        bucketName,
        key: "hello.txt",
        body: "hello ministack",
        contentType: "text/plain",
      },
    }),
    providers: [provider],
  });
  const object = (await dispatchLabRequest({
    binding: primary,
    request: request(primary, {
      region: "ap-northeast-1",
      serviceCode: "s3",
      operation: "GetObject",
      payload: { bucketName, key: "hello.txt" },
    }),
    providers: [provider],
  })) as { body: string };
  assert.equal(object.body, "hello ministack");

  const tableName = "notes_" + suffix;
  await dispatchLabRequest({
    binding: primary,
    request: request(primary, {
      region: "ap-northeast-1",
      serviceCode: "dynamodb",
      operation: "CreateTable",
      payload: { tableName },
    }),
    providers: [provider],
  });
  await dispatchLabRequest({
    binding: primary,
    request: request(primary, {
      region: "ap-northeast-1",
      serviceCode: "dynamodb",
      operation: "PutItem",
      payload: {
        tableName,
        item: { id: "1", title: "Tokyo item" },
      },
    }),
    providers: [provider],
  });
  const item = (await dispatchLabRequest({
    binding: primary,
    request: request(primary, {
      region: "ap-northeast-1",
      serviceCode: "dynamodb",
      operation: "GetItem",
      payload: {
        tableName,
        key: { id: "1" },
      },
    }),
    providers: [provider],
  })) as { item: { id: string; title: string } | null };
  assert.deepEqual(item.item, { id: "1", title: "Tokyo item" });

  const tokyoTables = (await dispatchLabRequest({
    binding: primary,
    request: request(primary, {
      region: "ap-northeast-1",
      serviceCode: "dynamodb",
      operation: "ListTables",
    }),
    providers: [provider],
  })) as { TableNames?: string[] };
  assert.equal(tokyoTables.TableNames?.includes(tableName), true);

  const osakaTables = (await dispatchLabRequest({
    binding: primary,
    request: request(primary, {
      region: "ap-northeast-3",
      serviceCode: "dynamodb",
      operation: "ListTables",
    }),
    providers: [provider],
  })) as { TableNames?: string[] };
  assert.equal(osakaTables.TableNames?.includes(tableName), false);

  const otherAccountTables = (await dispatchLabRequest({
    binding: secondaryAccount,
    request: request(secondaryAccount, {
      region: "ap-northeast-1",
      serviceCode: "dynamodb",
      operation: "ListTables",
    }),
    providers: [provider],
  })) as { TableNames?: string[] };
  assert.equal(otherAccountTables.TableNames?.includes(tableName), false);

  const queueName = "events-" + suffix;
  const queue = (await dispatchLabRequest({
    binding: primary,
    request: request(primary, {
      region: "ap-northeast-3",
      serviceCode: "sqs",
      operation: "CreateQueue",
      payload: { queueName },
    }),
    providers: [provider],
  })) as { queueUrl?: string };
  assert.ok(queue.queueUrl);

  await dispatchLabRequest({
    binding: primary,
    request: request(primary, {
      region: "ap-northeast-3",
      serviceCode: "sqs",
      operation: "SendMessage",
      payload: {
        queueUrl: queue.queueUrl,
        messageBody: "Osaka message",
      },
    }),
    providers: [provider],
  });
  const received = (await dispatchLabRequest({
    binding: primary,
    request: request(primary, {
      region: "ap-northeast-3",
      serviceCode: "sqs",
      operation: "ReceiveMessage",
      payload: { queueUrl: queue.queueUrl },
    }),
    providers: [provider],
  })) as { Messages?: Array<{ Body?: string }> };
  assert.equal(received.Messages?.[0]?.Body, "Osaka message");
});
