import {
  CfnOutput,
  CfnParameter,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as kms from "aws-cdk-lib/aws-kms";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

export class RuntimeStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    const platformAccountId = new CfnParameter(this, "PlatformAccountId", {
      type: "String",
      description: "AWS account ID hosting the Platform Control Plane",
      allowedPattern: "^[0-9]{12}$",
    });
    const platformVpcCidr = new CfnParameter(this, "PlatformVpcCidr", {
      type: "String",
      description: "Platform VPC CIDR routed over the Phase 0 VPC peering connection",
      allowedPattern: "^(?:[0-9]{1,3}\\.){3}[0-9]{1,3}/(?:[0-9]|[12][0-9]|3[0-2])$",
    });
    const platformBffSecurityGroupId = new CfnParameter(
      this,
      "PlatformBffSecurityGroupId",
      {
        type: "String",
        description: "Platform BFF security group allowed to reach Lab Gateway:8080",
        allowedPattern: "^sg-[0-9a-fA-F]+$",
      },
    );
    const s3ManagedPrefixListId = new CfnParameter(
      this,
      "S3ManagedPrefixListId",
      {
        type: "String",
        description: "AWS-managed S3 prefix list ID for the deployment Region",
        allowedPattern: "^pl-[0-9a-fA-F]+$",
      },
    );
    const runtimeVpcPeeringConnectionId = new CfnParameter(
      this,
      "RuntimeVpcPeeringConnectionId",
      {
        type: "String",
        description: "Accepted VPC peering connection between Platform and Runtime VPCs",
        allowedPattern: "^pcx-[0-9a-fA-F]+$",
      },
    );

    const vpc = new ec2.Vpc(this, "RuntimeVpc", {
      ipAddresses: ec2.IpAddresses.cidr("10.30.0.0/16"),
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: "runtime",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    vpc.isolatedSubnets.forEach((subnet, index) => {
      new ec2.CfnRoute(this, `PlatformPeeringRoute${index + 1}`, {
        routeTableId: subnet.routeTable.routeTableId,
        destinationCidrBlock: platformVpcCidr.valueAsString,
        vpcPeeringConnectionId: runtimeVpcPeeringConnectionId.valueAsString,
      });
    });

    const taskSecurityGroup = new ec2.SecurityGroup(this, "StandardTaskSecurityGroup", {
      vpc,
      description: "Standard Lab Fargate task security group",
      allowAllOutbound: false,
    });
    new ec2.CfnSecurityGroupIngress(this, "PlatformBffToLabGateway", {
      groupId: taskSecurityGroup.securityGroupId,
      ipProtocol: "tcp",
      fromPort: 8080,
      toPort: 8080,
      sourceSecurityGroupId: platformBffSecurityGroupId.valueAsString,
      sourceSecurityGroupOwnerId: platformAccountId.valueAsString,
      description: "Allow only Platform BFF to reach the private Lab Gateway",
    });

    const endpointSecurityGroup = new ec2.SecurityGroup(this, "EndpointSecurityGroup", {
      vpc,
      description: "Runtime private endpoint security group",
      allowAllOutbound: true,
    });
    endpointSecurityGroup.addIngressRule(
      taskSecurityGroup,
      ec2.Port.tcp(443),
      "Allow Standard Runtime access to AWS private endpoints",
    );
    taskSecurityGroup.addEgressRule(
      endpointSecurityGroup,
      ec2.Port.tcp(443),
      "Allow only ECR and CloudWatch Logs interface endpoints",
    );
    new ec2.CfnSecurityGroupEgress(this, "StandardTaskToS3Egress", {
      groupId: taskSecurityGroup.securityGroupId,
      ipProtocol: "tcp",
      fromPort: 443,
      toPort: 443,
      destinationPrefixListId: s3ManagedPrefixListId.valueAsString,
      description: "Allow ECR image layer downloads through the S3 gateway endpoint",
    });

    vpc.addGatewayEndpoint("S3Endpoint", {
      service: ec2.GatewayVpcEndpointAwsService.S3,
    });
    vpc.addInterfaceEndpoint("EcrApiEndpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.ECR,
      securityGroups: [endpointSecurityGroup],
      privateDnsEnabled: true,
    });
    vpc.addInterfaceEndpoint("EcrDockerEndpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
      securityGroups: [endpointSecurityGroup],
      privateDnsEnabled: true,
    });
    vpc.addInterfaceEndpoint("LogsEndpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
      securityGroups: [endpointSecurityGroup],
      privateDnsEnabled: true,
    });

    const cluster = new ecs.Cluster(this, "StandardCluster", {
      vpc,
      containerInsightsV2: ecs.ContainerInsights.ENHANCED,
    });

    const snapshotKey = new kms.Key(this, "SnapshotKey", {
      enableKeyRotation: true,
      description: "Phase 0 snapshot manifest encryption key",
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const snapshotBucket = new s3.Bucket(this, "SnapshotBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: snapshotKey,
      enforceSSL: true,
      versioned: false,
      lifecycleRules: [
        {
          id: "expire-prototype-snapshots",
          expiration: Duration.days(30),
        },
      ],
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const gatewayRepository = new ecr.Repository(this, "LabGatewayRepository", {
      imageScanOnPush: true,
      imageTagMutability: ecr.TagMutability.IMMUTABLE,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const ministackRepository = new ecr.Repository(this, "MiniStackMirrorRepository", {
      imageScanOnPush: true,
      imageTagMutability: ecr.TagMutability.IMMUTABLE,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const gatewayLogs = new logs.LogGroup(this, "GatewayLogs", {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const ministackLogs = new logs.LogGroup(this, "MiniStackLogs", {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const emptyTaskRole = new iam.Role(this, "StandardTaskRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      description:
        "Intentionally empty task role for learner-controlled Standard Runtime",
    });

    const ebsInfrastructureRole = new iam.Role(this, "EcsEbsInfrastructureRole", {
      assumedBy: new iam.ServicePrincipal("ecs.amazonaws.com"),
      description: "Allows ECS to manage per-task encrypted EBS volumes",
    });
    ebsInfrastructureRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AmazonECSInfrastructureRolePolicyForVolumes",
      ),
    );

    const taskDefinition = new ecs.FargateTaskDefinition(this, "StandardTaskDefinition", {
      cpu: 1024,
      memoryLimitMiB: 2048,
      ephemeralStorageGiB: 30,
      taskRole: emptyTaskRole,
      runtimePlatform: {
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
        cpuArchitecture: ecs.CpuArchitecture.X86_64,
      },
    });
    taskDefinition.addVolume({
      name: "lab-state",
      configuredAtLaunch: true,
    });

    const ministack = taskDefinition.addContainer("MiniStack", {
      containerName: "ministack",
      image: ecs.ContainerImage.fromEcrRepository(
        ministackRepository,
        "prototype",
      ),
      logging: ecs.LogDrivers.awsLogs({
        logGroup: ministackLogs,
        streamPrefix: "ministack",
      }),
      environment: {
        PERSIST_STATE: "1",
        STATE_DIR: "/lab-state/state",
        S3_PERSIST: "1",
        S3_DATA_DIR: "/lab-state/s3-data",
      },
      essential: true,
      privileged: false,
    });
    ministack.addMountPoints({
      sourceVolume: "lab-state",
      containerPath: "/lab-state",
      readOnly: false,
    });
    ministack.addPortMappings({
      containerPort: 4566,
      protocol: ecs.Protocol.TCP,
    });

    const gateway = taskDefinition.addContainer("LabGateway", {
      containerName: "lab-gateway",
      image: ecs.ContainerImage.fromEcrRepository(
        gatewayRepository,
        "prototype",
      ),
      logging: ecs.LogDrivers.awsLogs({
        logGroup: gatewayLogs,
        streamPrefix: "lab-gateway",
      }),
      environment: {
        PORT: "8080",
        MINISTACK_ENDPOINT: "http://127.0.0.1:4566",
      },
      essential: true,
      readonlyRootFilesystem: true,
      privileged: false,
    });
    gateway.addPortMappings({
      containerPort: 8080,
      protocol: ecs.Protocol.TCP,
    });
    gateway.addContainerDependencies({
      container: ministack,
      condition: ecs.ContainerDependencyCondition.START,
    });

    taskDefinition.executionRole?.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.DENY,
        actions: ["sts:AssumeRole"],
        resources: ["*"],
      }),
    );

    const orchestratorRole = new iam.Role(this, "RuntimeOrchestratorRole", {
      assumedBy: new iam.AccountPrincipal(platformAccountId.valueAsString),
      description:
        "Cross-account role used by the Platform Control Plane to manage Standard Runtime tasks",
    });
    taskDefinition.grantRun(orchestratorRole);
    orchestratorRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["iam:PassRole"],
        resources: [ebsInfrastructureRole.roleArn],
      }),
    );
    orchestratorRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ecs:StopTask", "ecs:DescribeTasks"],
        resources: ["*"],
      }),
    );
    orchestratorRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ecs:ListTasks"],
        resources: ["*"],
        conditions: { ArnEquals: { "ecs:cluster": cluster.clusterArn } },
      }),
    );
    orchestratorRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ecs:TagResource"],
        resources: ["*"],
        conditions: {
          StringEquals: {
            "ecs:CreateAction": "RunTask",
            "aws:RequestTag/ManagedBy": "aws-internal-lab",
          },
        },
      }),
    );
    orchestratorRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "ec2:CreateSnapshot",
          "ec2:DescribeSnapshots",
          "ec2:DeleteSnapshot",
          "ec2:DeleteVolume",
          "ec2:DescribeVolumes",
        ],
        resources: ["*"],
      }),
    );
    snapshotBucket.grantReadWrite(orchestratorRole);
    snapshotKey.grantEncryptDecrypt(orchestratorRole);

    new CfnOutput(this, "RuntimeVpcId", { value: vpc.vpcId });
    new CfnOutput(this, "StandardClusterArn", { value: cluster.clusterArn });
    new CfnOutput(this, "RuntimeOrchestratorRoleArn", {
      value: orchestratorRole.roleArn,
    });
    new CfnOutput(this, "StandardTaskDefinitionArn", {
      value: taskDefinition.taskDefinitionArn,
    });
    new CfnOutput(this, "EcsEbsInfrastructureRoleArn", {
      value: ebsInfrastructureRole.roleArn,
    });
    new CfnOutput(this, "StandardTaskSecurityGroupId", {
      value: taskSecurityGroup.securityGroupId,
    });
    new CfnOutput(this, "StandardSubnetIds", {
      value: vpc.isolatedSubnets.map((subnet) => subnet.subnetId).join(","),
    });
    new CfnOutput(this, "LabGatewayRepositoryUri", {
      value: gatewayRepository.repositoryUri,
    });
    new CfnOutput(this, "MiniStackMirrorRepositoryUri", {
      value: ministackRepository.repositoryUri,
    });
    new CfnOutput(this, "SnapshotBucketName", {
      value: snapshotBucket.bucketName,
    });
    new CfnOutput(this, "SnapshotKeyArn", {
      value: snapshotKey.keyArn,
    });
  }
}
