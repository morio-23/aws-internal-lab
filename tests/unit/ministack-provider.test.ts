import assert from "node:assert/strict";
import test from "node:test";

import {
  CreateBucketCommand,
} from "@aws-sdk/client-s3";
import {
  CreateTableCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  CreateQueueCommand,
} from "@aws-sdk/client-sqs";

import {
  createLabCredential,
  dispatchLabRequest,
  type LabBinding,
} from "../../apps/lab-gateway/src/index.js";
import {
  MiniStackProvider,
  type MiniStackClientFactory,
} from "../../apps/lab-gateway/src/providers/ministack.js";

function binding(): LabBinding {
  const virtualAccountId = "012345678901";
  const sessionId = "session-ministack";
  return {
    workspaceId: "workspace-ministack",
    sessionId,
    virtualAccountId,
    enabledRegions: ["ap-northeast-1", "ap-northeast-3"],
    credential: createLabCredential({ virtualAccountId, sessionId }),
  };
}

function request(
  target: LabBinding,
  input: {
    region?: string;
    serviceCode: string;
    operation: string;
    payload?: unknown;
  },
) {
  return {
    workspaceId: target.workspaceId,
    sessionId: target.sessionId,
    virtualAccountId: target.virtualAccountId,
    virtualRegion: input.region ?? "ap-northeast-1",
    serviceCode: input.serviceCode,
    operation: input.operation,
    ...(input.payload === undefined ? {} : { payload: input.payload }),
    accessKeyId: target.credential.accessKeyId,
    secretAccessKey: target.credential.secretAccessKey,
    correlationId: "corr-ministack",
  };
}

test("MiniStack S3 provider preserves Osaka virtual region", async () => {
  const target = binding();
  const commands: object[] = [];
  const factoryCalls: Parameters<MiniStackClientFactory>[0][] = [];

  const factory: MiniStackClientFactory = (input) => {
    factoryCalls.push(input);
    return {
      s3: {
        async send(command) {
          commands.push(command);
          return {};
        },
      },
      dynamodb: { async send() { return {}; } },
      sqs: { async send() { return {}; } },
    };
  };

  const provider = new MiniStackProvider({
    endpoint: "http://127.0.0.1:4566",
    clientFactory: factory,
  });

  const result = await dispatchLabRequest({
    binding: target,
    request: request(target, {
      region: "ap-northeast-3",
      serviceCode: "s3",
      operation: "CreateBucket",
      payload: { bucketName: "training-bucket" },
    }),
    providers: [provider],
  });

  assert.deepEqual(result, {
    bucketName: "training-bucket",
    arn: "arn:aws:s3:::training-bucket",
    region: "ap-northeast-3",
  });
  assert.equal(factoryCalls[0]?.region, "ap-northeast-3");
  assert.equal(factoryCalls[0]?.accessKeyId, "012345678901");

  const command = commands[0];
  assert.equal(command instanceof CreateBucketCommand, true);
  assert.equal(
    (command as CreateBucketCommand).input.CreateBucketConfiguration
      ?.LocationConstraint,
    "ap-northeast-3",
  );
});

test("MiniStack DynamoDB provider creates regional ARN and marshals item", async () => {
  const target = binding();
  const commands: object[] = [];

  const provider = new MiniStackProvider({
    endpoint: "http://127.0.0.1:4566",
    clientFactory: () => ({
      s3: { async send() { return {}; } },
      dynamodb: {
        async send(command) {
          commands.push(command);
          return {};
        },
      },
      sqs: { async send() { return {}; } },
    }),
  });

  const created = await dispatchLabRequest({
    binding: target,
    request: request(target, {
      serviceCode: "dynamodb",
      operation: "CreateTable",
      payload: { tableName: "notes" },
    }),
    providers: [provider],
  });
  assert.deepEqual(created, {
    tableName: "notes",
    arn: "arn:aws:dynamodb:ap-northeast-1:012345678901:table/notes",
  });
  assert.equal(commands[0] instanceof CreateTableCommand, true);

  await dispatchLabRequest({
    binding: target,
    request: request(target, {
      serviceCode: "dynamodb",
      operation: "PutItem",
      payload: {
        tableName: "notes",
        item: { id: "1", title: "hello" },
      },
    }),
    providers: [provider],
  });

  const put = commands[1] as PutItemCommand;
  assert.equal(put instanceof PutItemCommand, true);
  assert.deepEqual(put.input.Item, {
    id: { S: "1" },
    title: { S: "hello" },
  });
});

test("MiniStack SQS provider returns account and region scoped ARN", async () => {
  const target = binding();
  const commands: object[] = [];

  const provider = new MiniStackProvider({
    endpoint: "http://127.0.0.1:4566",
    clientFactory: () => ({
      s3: { async send() { return {}; } },
      dynamodb: { async send() { return {}; } },
      sqs: {
        async send(command) {
          commands.push(command);
          return { QueueUrl: "http://ministack/012345678901/events" };
        },
      },
    }),
  });

  const result = await dispatchLabRequest({
    binding: target,
    request: request(target, {
      region: "ap-northeast-3",
      serviceCode: "sqs",
      operation: "CreateQueue",
      payload: { queueName: "events" },
    }),
    providers: [provider],
  });

  assert.deepEqual(result, {
    queueName: "events",
    queueUrl: "http://ministack/012345678901/events",
    arn: "arn:aws:sqs:ap-northeast-3:012345678901:events",
  });
  assert.equal(commands[0] instanceof CreateQueueCommand, true);
});
