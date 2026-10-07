import {
  CfnOutput,
  CfnParameter,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from "aws-cdk-lib";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as iam from "aws-cdk-lib/aws-iam";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";

export class PlatformOperationsStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    const runtimeAccountId = new CfnParameter(this, "RuntimeAccountId", {
      type: "String",
      description: "AWS account ID hosting Standard Runtime resources",
      allowedPattern: "^[0-9]{12}$",
    });
    const platformVpcId = new CfnParameter(this, "PlatformVpcId", {
      type: "String",
      description: "Existing Platform VPC that accepts the Runtime VPC peer",
      allowedPattern: "^vpc-[0-9a-fA-F]+$",
    });

    const platformVpcArn = this.formatArn({
      service: "ec2",
      resource: "vpc",
      resourceName: platformVpcId.valueAsString,
    });
    const peeringArn = this.formatArn({
      service: "ec2",
      resource: "vpc-peering-connection",
      resourceName: "*",
    });
    const peeringAccepterRole = new iam.Role(this, "RuntimeVpcPeeringAccepterRole", {
      assumedBy: new iam.AccountPrincipal(runtimeAccountId.valueAsString),
      description:
        "Allows the Runtime account CloudFormation stack to establish VPC peering with the Platform VPC",
    });
    peeringAccepterRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ec2:AcceptVpcPeeringConnection"],
        resources: [platformVpcArn],
      }),
    );
    peeringAccepterRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ec2:AcceptVpcPeeringConnection"],
        resources: [peeringArn],
        conditions: {
          StringEquals: {
            "ec2:AccepterVpc": platformVpcArn,
          },
        },
      }),
    );

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
      visibilityTimeout: Duration.minutes(30),
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
    new CfnOutput(this, "RuntimeVpcPeeringAccepterRoleArn", {
      value: peeringAccepterRole.roleArn,
    });
  }
}
