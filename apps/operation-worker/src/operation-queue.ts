import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
  type SQSClientConfig,
} from "@aws-sdk/client-sqs";

import type { OperationQueue, OperationQueueMessage } from "./outbox-relay.js";

export type ReceivedOperationMessage = {
  body: unknown;
  receiptHandle: string;
};

export interface OperationInbox {
  receive(): Promise<ReceivedOperationMessage[]>;
  delete(receiptHandle: string): Promise<void>;
}

type SqsSender = {
  send(command: SendMessageCommand | ReceiveMessageCommand | DeleteMessageCommand): Promise<unknown>;
};

export class SqsOperationQueue implements OperationQueue, OperationInbox {
  readonly #client: SqsSender;
  readonly #queueUrl: string;

  constructor(input: { queueUrl: string; client?: SqsSender; clientConfig?: SQSClientConfig }) {
    if (!input.queueUrl.endsWith(".fifo")) throw new Error("OPERATION_QUEUE_MUST_BE_FIFO");
    this.#queueUrl = input.queueUrl;
    if (input.client) {
      this.#client = input.client;
    } else {
      const sqs = new SQSClient(input.clientConfig ?? {});
      this.#client = {
        async send(command) {
          if (command instanceof SendMessageCommand) return sqs.send(command);
          if (command instanceof ReceiveMessageCommand) return sqs.send(command);
          return sqs.send(command);
        },
      };
    }
  }

  async send(message: OperationQueueMessage): Promise<void> {
    await this.#client.send(new SendMessageCommand({
      QueueUrl: this.#queueUrl,
      MessageBody: JSON.stringify(message.body),
      MessageGroupId: message.messageGroupId,
      MessageDeduplicationId: message.deduplicationId,
    }));
  }

  async receive(): Promise<ReceivedOperationMessage[]> {
    const result = await this.#client.send(new ReceiveMessageCommand({
      QueueUrl: this.#queueUrl,
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: 1,
    })) as { Messages?: Array<{ Body?: string; ReceiptHandle?: string }> };
    return (result.Messages ?? []).map((message) => {
      if (!message.Body || !message.ReceiptHandle) throw new Error("INVALID_OPERATION_QUEUE_MESSAGE");
      return { body: JSON.parse(message.Body) as unknown, receiptHandle: message.ReceiptHandle };
    });
  }

  async delete(receiptHandle: string): Promise<void> {
    await this.#client.send(new DeleteMessageCommand({
      QueueUrl: this.#queueUrl,
      ReceiptHandle: receiptHandle,
    }));
  }
}
