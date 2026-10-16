import {
  CfnOutput,
  CfnParameter,
  Duration,
  Fn,
  RemovalPolicy,
  Stack,
  type StackProps,
} from "aws-cdk-lib";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
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
    const runtimeCloudFormationRoleArn = new CfnParameter(this, "RuntimeCloudFormationRoleArn", {
      type: "String",
      description: "Exact Runtime account deployment role allowed to establish VPC peering",
      allowedPattern: "^arn:[^:]+:iam::[0-9]{12}:role/.+$",
    });
    const platformVpcCidr = new CfnParameter(this, "PlatformVpcCidr", {
      type: "String",
      description: "CIDR of the existing Platform VPC",
    });
    const parameter = (name: string, description: string, allowedPattern?: string) =>
      new CfnParameter(this, name, {
        type: "String",
        description,
        ...(allowedPattern ? { allowedPattern } : {}),
      });
    const subnetA = parameter("PlatformPrivateSubnetIdA", "Private worker subnet in AZ A", "^subnet-[0-9a-fA-F]+$");
    const subnetB = parameter("PlatformPrivateSubnetIdB", "Private worker subnet in AZ B", "^subnet-[0-9a-fA-F]+$");
    const routeA = parameter("PlatformPrivateRouteTableIdA", "Route table for worker subnet A", "^rtb-[0-9a-fA-F]+$");
    const routeB = parameter("PlatformPrivateRouteTableIdB", "Route table for worker subnet B", "^rtb-[0-9a-fA-F]+$");
    const bffSecurityGroupId = parameter("PlatformBffSecurityGroupId", "Existing internal BFF service security group", "^sg-[0-9a-fA-F]+$");
    const bffInternalUrl = parameter("PlatformBffInternalUrl", "Private BFF URL reachable from Worker, such as http://bff.internal:3001");
    const databaseSecurityGroupId = parameter("PlatformDatabaseSecurityGroupId", "Existing database security group", "^sg-[0-9a-fA-F]+$");
    const s3PrefixListId = parameter("S3ManagedPrefixListId", "Regional S3 managed prefix list ID", "^pl-[0-9a-fA-F]+$");
    const databaseUrlSecretArn = new CfnParameter(this, "DatabaseUrlSecretArn", {
      type: "String",
      noEcho: true,
      description: "Secrets Manager ARN containing the worker DATABASE_URL",
    });
    const privateKeySecretArn = new CfnParameter(this, "PlatformRuntimePrivateKeySecretArn", {
      type: "String",
      noEcho: true,
      description: "Secrets Manager ARN containing PLATFORM_RUNTIME_PRIVATE_KEY_B64",
    });
    const publicKeySecretArn = new CfnParameter(this, "PlatformRuntimePublicKeySecretArn", {
      type: "String",
      noEcho: true,
      description: "Secrets Manager ARN containing PLATFORM_RUNTIME_PUBLIC_KEY_B64",
    });
    const standardClusterArn = parameter("StandardClusterArn", "RuntimeStack StandardClusterArn output");
    const standardTaskDefinitionArn = parameter("StandardTaskDefinitionArn", "RuntimeStack StandardTaskDefinitionArn output");
    const standardSubnetIds = parameter("StandardSubnetIds", "RuntimeStack StandardSubnetIds output");
    const standardSecurityGroupIds = parameter("StandardSecurityGroupIds", "RuntimeStack StandardTaskSecurityGroupId output");
    const ebsInfrastructureRoleArn = parameter("EcsEbsInfrastructureRoleArn", "RuntimeStack EcsEbsInfrastructureRoleArn output");
    const snapshotBucketName = parameter("SnapshotBucketName", "RuntimeStack SnapshotBucketName output");
    const workerDesiredCount = new CfnParameter(this, "WorkerDesiredCount", {
      type: "Number",
      default: 0,
      allowedValues: ["0", "1"],
      description: "Set to 1 after RuntimeStack outputs and worker image are supplied",
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
      assumedBy: new iam.ArnPrincipal(runtimeCloudFormationRoleArn.valueAsString),
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

    const vpc = ec2.Vpc.fromVpcAttributes(this, "PlatformVpc", {
      vpcId: platformVpcId.valueAsString,
      vpcCidrBlock: platformVpcCidr.valueAsString,
      availabilityZones: [Fn.select(0, Fn.getAzs()), Fn.select(1, Fn.getAzs())],
      privateSubnetIds: [subnetA.valueAsString, subnetB.valueAsString],
      privateSubnetRouteTableIds: [routeA.valueAsString, routeB.valueAsString],
    });
    const workerSecurityGroup = new ec2.SecurityGroup(this, "OperationWorkerSecurityGroup", {
      vpc,
      description: "Operation Worker private egress boundary",
      allowAllOutbound: false,
    });
    const endpointSecurityGroup = new ec2.SecurityGroup(this, "WorkerEndpointSecurityGroup", {
      vpc,
      description: "Private AWS endpoints used by the Operation Worker",
      allowAllOutbound: false,
    });
    endpointSecurityGroup.addIngressRule(workerSecurityGroup, ec2.Port.tcp(443));
    workerSecurityGroup.addEgressRule(endpointSecurityGroup, ec2.Port.tcp(443));
    const databaseSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(
      this, "PlatformDatabaseSecurityGroup", databaseSecurityGroupId.valueAsString,
      { mutable: true },
    );
    databaseSecurityGroup.addIngressRule(workerSecurityGroup, ec2.Port.tcp(5432));
    workerSecurityGroup.addEgressRule(databaseSecurityGroup, ec2.Port.tcp(5432));
    const bffSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(
      this, "PlatformBffSecurityGroup", bffSecurityGroupId.valueAsString, { mutable: true },
    );
    bffSecurityGroup.addIngressRule(workerSecurityGroup, ec2.Port.tcp(3001));
    workerSecurityGroup.addEgressRule(bffSecurityGroup, ec2.Port.tcp(3001));
    new ec2.CfnSecurityGroupEgress(this, "WorkerToS3Endpoint", {
      groupId: workerSecurityGroup.securityGroupId,
      ipProtocol: "tcp",
      fromPort: 443,
      toPort: 443,
      destinationPrefixListId: s3PrefixListId.valueAsString,
    });
    for (const [name, service] of Object.entries({
      Sqs: ec2.InterfaceVpcEndpointAwsService.SQS,
      Ecs: ec2.InterfaceVpcEndpointAwsService.ECS,
      Ec2: ec2.InterfaceVpcEndpointAwsService.EC2,
      Sts: ec2.InterfaceVpcEndpointAwsService.STS,
      SecretsManager: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      EcrApi: ec2.InterfaceVpcEndpointAwsService.ECR,
      EcrDocker: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
      Logs: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
    })) {
      vpc.addInterfaceEndpoint(`${name}WorkerEndpoint`, {
        service,
        securityGroups: [endpointSecurityGroup],
        privateDnsEnabled: true,
        subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      });
    }
    vpc.addGatewayEndpoint("WorkerS3Endpoint", {
      service: ec2.GatewayVpcEndpointAwsService.S3,
      subnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
    });

    const cluster = new ecs.Cluster(this, "OperationWorkerCluster", { vpc });
    const workerTaskRole = new iam.Role(this, "OperationWorkerTaskRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      roleName: "aws-internal-lab-platform-worker",
    });
    operationQueue.grantConsumeMessages(workerTaskRole);
    operationQueue.grantSendMessages(workerTaskRole);
    const runtimeRoleArn = this.formatArn({
      service: "iam",
      region: "",
      account: runtimeAccountId.valueAsString,
      resource: "role",
      resourceName: "aws-internal-lab-runtime-orchestrator",
    });
    workerTaskRole.addToPolicy(new iam.PolicyStatement({
      actions: ["sts:AssumeRole"],
      resources: [runtimeRoleArn],
    }));
    const workerExecutionRole = new iam.Role(this, "OperationWorkerExecutionRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    });
    const taskDefinition = new ecs.FargateTaskDefinition(this, "OperationWorkerTaskDefinition", {
      cpu: 512,
      memoryLimitMiB: 1024,
      taskRole: workerTaskRole,
      executionRole: workerExecutionRole,
    });
    const databaseSecret = secretsmanager.Secret.fromSecretCompleteArn(this, "DatabaseUrlSecret", databaseUrlSecretArn.valueAsString);
    const privateKeySecret = secretsmanager.Secret.fromSecretCompleteArn(this, "RuntimePrivateKeySecret", privateKeySecretArn.valueAsString);
    const publicKeySecret = secretsmanager.Secret.fromSecretCompleteArn(this, "RuntimePublicKeySecret", publicKeySecretArn.valueAsString);
    for (const secret of [databaseSecret, privateKeySecret, publicKeySecret]) {
      secret.grantRead(workerExecutionRole);
    }
    const workerLogs = new logs.LogGroup(this, "OperationWorkerLogs", {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    taskDefinition.addContainer("OperationWorker", {
      containerName: "operation-worker",
      image: ecs.ContainerImage.fromEcrRepository(workerRepository, "prototype"),
      command: ["node", "dist/apps/operation-worker/src/main.js"],
      logging: ecs.LogDrivers.awsLogs({ logGroup: workerLogs, streamPrefix: "operation-worker" }),
      secrets: {
        DATABASE_URL: ecs.Secret.fromSecretsManager(databaseSecret),
        PLATFORM_RUNTIME_PRIVATE_KEY_B64: ecs.Secret.fromSecretsManager(privateKeySecret),
        PLATFORM_RUNTIME_PUBLIC_KEY_B64: ecs.Secret.fromSecretsManager(publicKeySecret),
      },
      environment: {
        AWS_REGION: this.region,
        PLATFORM_BFF_INTERNAL_URL: bffInternalUrl.valueAsString,
        OPERATION_QUEUE_URL: operationQueue.queueUrl,
        RUNTIME_ORCHESTRATOR_ROLE_ARN: runtimeRoleArn,
        STANDARD_CLUSTER_ARN: standardClusterArn.valueAsString,
        STANDARD_TASK_DEFINITION_ARN: standardTaskDefinitionArn.valueAsString,
        STANDARD_SUBNET_IDS: standardSubnetIds.valueAsString,
        STANDARD_SECURITY_GROUP_IDS: standardSecurityGroupIds.valueAsString,
        ECS_EBS_INFRASTRUCTURE_ROLE_ARN: ebsInfrastructureRoleArn.valueAsString,
        SNAPSHOT_BUCKET_NAME: snapshotBucketName.valueAsString,
      },
      healthCheck: {
        command: ["CMD-SHELL", "node -e 'process.kill(1,0)'"],
        interval: Duration.seconds(30),
        retries: 3,
      },
    });
    const service = new ecs.FargateService(this, "OperationWorkerService", {
      cluster,
      taskDefinition,
      desiredCount: 0,
      assignPublicIp: false,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [workerSecurityGroup],
    });
    const cfnService = service.node.defaultChild as ecs.CfnService;
    cfnService.desiredCount = workerDesiredCount.valueAsNumber;

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
    new CfnOutput(this, "OperationWorkerTaskRoleArn", { value: workerTaskRole.roleArn });
    new CfnOutput(this, "OperationWorkerSecurityGroupId", { value: workerSecurityGroup.securityGroupId });
  }
}
