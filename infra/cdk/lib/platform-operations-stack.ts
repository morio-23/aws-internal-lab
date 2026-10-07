import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from "aws-cdk-lib";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";

export class PlatformOperationsStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    const deadLetterQueue = new sqs.Queue(this, "OperationDeadLetterQueue", {
      fifo: true,
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      retentionPeriod: Duration.days(14),
    });

    const operationQueue = new sqs.Queue(this, "OperationQueue", {
      fifo: true,
      contentBasedDeduplication: false,
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      receiveMessageWaitTime: Duration.seconds(20),
      visibilityTimeout: Duration.minutes(5),
      retentionPeriod: Duration.days(4),
      deadLetterQueue: {
        queue: deadLetterQueue,
        maxReceiveCount: 5,
      },
    });

    const workerRepository = new ecr.Repository(this, "OperationWorkerRepository", {
      imageScanOnPush: true,
      imageTagMutability: ecr.TagMutability.IMMUTABLE,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    new CfnOutput(this, "OperationQueueUrl", {
      value: operationQueue.queueUrl,
    });
    new CfnOutput(this, "OperationQueueArn", {
      value: operationQueue.queueArn,
    });
    new CfnOutput(this, "OperationDeadLetterQueueArn", {
      value: deadLetterQueue.queueArn,
    });
    new CfnOutput(this, "OperationWorkerRepositoryUri", {
      value: workerRepository.repositoryUri,
    });
  }
}
