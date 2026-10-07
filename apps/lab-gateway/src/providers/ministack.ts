import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListBucketsCommand,
  PutObjectCommand,
  S3Client,
  type BucketLocationConstraint,
} from "@aws-sdk/client-s3";
import {
  CreateTableCommand,
  DeleteItemCommand,
  DeleteTableCommand,
  DynamoDBClient,
  GetItemCommand,
  ListTablesCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  CreateQueueCommand,
  DeleteMessageCommand,
  DeleteQueueCommand,
  ListQueuesCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

import {
  regionalArn,
  s3BucketArn,
  type VirtualRegion,
} from "../../../../packages/aws-virtual/src/index.js";
import type {
  ProviderAdapter,
  ProviderInvocation,
} from "../index.js";

type Sender = {
  send(command: object): Promise<unknown>;
};

type ClientBundle = {
  s3: Sender;
  dynamodb: Sender;
  sqs: Sender;
};

export type MiniStackClientFactory = (input: {
  endpoint: string;
  region: VirtualRegion;
  accessKeyId: string;
  secretAccessKey: string;
}) => ClientBundle;

function defaultClientFactory(input: {
  endpoint: string;
  region: VirtualRegion;
  accessKeyId: string;
  secretAccessKey: string;
}): ClientBundle {
  const credentials = {
    accessKeyId: input.accessKeyId,
    secretAccessKey: input.secretAccessKey,
  };

  const s3 = new S3Client({
    endpoint: input.endpoint,
    region: input.region,
    credentials,
    forcePathStyle: true,
  });
  const dynamodb = new DynamoDBClient({
    endpoint: input.endpoint,
    region: input.region,
    credentials,
  });
  const sqs = new SQSClient({
    endpoint: input.endpoint,
    region: input.region,
    credentials,
  });

  return {
    s3: { send: (command) => s3.send(command as never) },
    dynamodb: { send: (command) => dynamodb.send(command as never) },
    sqs: { send: (command) => sqs.send(command as never) },
  };
}

function payloadRecord(payload: unknown): Record<string, unknown> {
  if (payload === undefined || payload === null) return {};
  if (typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("INVALID_OPERATION_PAYLOAD");
  }
  return payload as Record<string, unknown>;
}

function requiredString(
  payload: Record<string, unknown>,
  name: string,
): string {
  const value = payload[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("INVALID_OPERATION_PAYLOAD:" + name);
  }
  return value;
}

function optionalString(
  payload: Record<string, unknown>,
  name: string,
): string | undefined {
  const value = payload[name];
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new Error("INVALID_OPERATION_PAYLOAD:" + name);
  }
  return value;
}

function requiredObject(
  payload: Record<string, unknown>,
  name: string,
): Record<string, unknown> {
  const value = payload[name];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("INVALID_OPERATION_PAYLOAD:" + name);
  }
  return value as Record<string, unknown>;
}

async function invokeS3(
  clients: ClientBundle,
  input: ProviderInvocation,
): Promise<unknown> {
  const payload = payloadRecord(input.request.payload);
  const region = input.request.virtualRegion as VirtualRegion;

  switch (input.request.operation) {
    case "CreateBucket": {
      const bucketName = requiredString(payload, "bucketName");
      await clients.s3.send(
        new CreateBucketCommand({
          Bucket: bucketName,
          CreateBucketConfiguration: {
            LocationConstraint: region as BucketLocationConstraint,
          },
        }),
      );
      return {
        bucketName,
        arn: s3BucketArn(bucketName),
        region,
      };
    }
    case "ListBuckets": {
      const result = (await clients.s3.send(
        new ListBucketsCommand({}),
      )) as Awaited<ReturnType<S3Client["send"]>>;
      return result;
    }
    case "PutObject": {
      const bucketName = requiredString(payload, "bucketName");
      const key = requiredString(payload, "key");
      const body = requiredString(payload, "body");
      const result = await clients.s3.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: key,
          Body: body,
          ContentType: optionalString(payload, "contentType"),
        }),
      );
      return { bucketName, key, result };
    }
    case "GetObject": {
      const bucketName = requiredString(payload, "bucketName");
      const key = requiredString(payload, "key");
      const result = (await clients.s3.send(
        new GetObjectCommand({ Bucket: bucketName, Key: key }),
      )) as {
        Body?: { transformToString(): Promise<string> };
        ContentType?: string;
        ETag?: string;
      };
      return {
        bucketName,
        key,
        body: result.Body ? await result.Body.transformToString() : "",
        contentType: result.ContentType,
        eTag: result.ETag,
      };
    }
    case "DeleteObject": {
      const bucketName = requiredString(payload, "bucketName");
      const key = requiredString(payload, "key");
      await clients.s3.send(
        new DeleteObjectCommand({ Bucket: bucketName, Key: key }),
      );
      return { bucketName, key, deleted: true };
    }
    case "DeleteBucket": {
      const bucketName = requiredString(payload, "bucketName");
      await clients.s3.send(new DeleteBucketCommand({ Bucket: bucketName }));
      return { bucketName, deleted: true };
    }
    default:
      throw new Error("MINISTACK_OPERATION_NOT_IMPLEMENTED");
  }
}

async function invokeDynamoDb(
  clients: ClientBundle,
  input: ProviderInvocation,
): Promise<unknown> {
  const payload = payloadRecord(input.request.payload);
  const region = input.request.virtualRegion as VirtualRegion;
  const accountId = input.binding.virtualAccountId;

  switch (input.request.operation) {
    case "CreateTable": {
      const tableName = requiredString(payload, "tableName");
      await clients.dynamodb.send(
        new CreateTableCommand({
          TableName: tableName,
          BillingMode: "PAY_PER_REQUEST",
          AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
          KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        }),
      );
      return {
        tableName,
        arn: regionalArn({
          service: "dynamodb",
          region,
          accountId,
          resource: "table/" + tableName,
        }),
      };
    }
    case "ListTables":
      return clients.dynamodb.send(new ListTablesCommand({}));
    case "PutItem": {
      const tableName = requiredString(payload, "tableName");
      const item = requiredObject(payload, "item");
      await clients.dynamodb.send(
        new PutItemCommand({
          TableName: tableName,
          Item: marshall(item, { removeUndefinedValues: true }),
        }),
      );
      return { tableName, item };
    }
    case "GetItem": {
      const tableName = requiredString(payload, "tableName");
      const key = requiredObject(payload, "key");
      const result = (await clients.dynamodb.send(
        new GetItemCommand({
          TableName: tableName,
          Key: marshall(key),
        }),
      )) as { Item?: Parameters<typeof unmarshall>[0] };
      return {
        tableName,
        item: result.Item ? unmarshall(result.Item) : null,
      };
    }
    case "DeleteItem": {
      const tableName = requiredString(payload, "tableName");
      const key = requiredObject(payload, "key");
      await clients.dynamodb.send(
        new DeleteItemCommand({
          TableName: tableName,
          Key: marshall(key),
        }),
      );
      return { tableName, deleted: true };
    }
    case "DeleteTable": {
      const tableName = requiredString(payload, "tableName");
      await clients.dynamodb.send(
        new DeleteTableCommand({ TableName: tableName }),
      );
      return { tableName, deleted: true };
    }
    default:
      throw new Error("MINISTACK_OPERATION_NOT_IMPLEMENTED");
  }
}

async function invokeSqs(
  clients: ClientBundle,
  input: ProviderInvocation,
): Promise<unknown> {
  const payload = payloadRecord(input.request.payload);
  const region = input.request.virtualRegion as VirtualRegion;
  const accountId = input.binding.virtualAccountId;

  switch (input.request.operation) {
    case "CreateQueue": {
      const queueName = requiredString(payload, "queueName");
      const result = (await clients.sqs.send(
        new CreateQueueCommand({ QueueName: queueName }),
      )) as { QueueUrl?: string };
      return {
        queueName,
        queueUrl: result.QueueUrl,
        arn: regionalArn({
          service: "sqs",
          region,
          accountId,
          resource: queueName,
        }),
      };
    }
    case "ListQueues":
      return clients.sqs.send(new ListQueuesCommand({}));
    case "SendMessage": {
      const queueUrl = requiredString(payload, "queueUrl");
      const messageBody = requiredString(payload, "messageBody");
      const result = await clients.sqs.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: messageBody,
        }),
      );
      return { queueUrl, result };
    }
    case "ReceiveMessage": {
      const queueUrl = requiredString(payload, "queueUrl");
      const result = await clients.sqs.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 0,
        }),
      );
      return result;
    }
    case "DeleteMessage": {
      const queueUrl = requiredString(payload, "queueUrl");
      const receiptHandle = requiredString(payload, "receiptHandle");
      await clients.sqs.send(
        new DeleteMessageCommand({
          QueueUrl: queueUrl,
          ReceiptHandle: receiptHandle,
        }),
      );
      return { queueUrl, deleted: true };
    }
    case "DeleteQueue": {
      const queueUrl = requiredString(payload, "queueUrl");
      await clients.sqs.send(new DeleteQueueCommand({ QueueUrl: queueUrl }));
      return { queueUrl, deleted: true };
    }
    default:
      throw new Error("MINISTACK_OPERATION_NOT_IMPLEMENTED");
  }
}

export class MiniStackProvider implements ProviderAdapter {
  readonly kind = "ministack" as const;
  readonly #endpoint: string;
  readonly #clientFactory: MiniStackClientFactory;

  constructor(input: {
    endpoint: string;
    clientFactory?: MiniStackClientFactory;
  }) {
    this.#endpoint = input.endpoint;
    this.#clientFactory = input.clientFactory ?? defaultClientFactory;
  }

  async invoke(input: ProviderInvocation): Promise<unknown> {
    const region = input.request.virtualRegion as VirtualRegion;
    const clients = this.#clientFactory({
      endpoint: this.#endpoint,
      region,
      accessKeyId: input.binding.credential.accessKeyId,
      secretAccessKey: input.binding.credential.secretAccessKey,
    });

    switch (input.request.serviceCode.toLowerCase()) {
      case "s3":
        return invokeS3(clients, input);
      case "dynamodb":
        return invokeDynamoDb(clients, input);
      case "sqs":
        return invokeSqs(clients, input);
      default:
        throw new Error("MINISTACK_SERVICE_NOT_IMPLEMENTED");
    }
  }
}
