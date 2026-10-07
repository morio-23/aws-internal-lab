import {
  CfnOutput,
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
import { Construct } from "constructs";

export class RuntimeStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

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

    const taskSecurityGroup = new ec2.SecurityGroup(this, "StandardTaskSecurityGroup", {
      vpc,
      description: "Standard Lab Fargate task security group",
      allowAllOutbound: true,
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
    taskDefinition.addVolume({ name: "lab-state" });

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

    new CfnOutput(this, "RuntimeVpcId", { value: vpc.vpcId });
    new CfnOutput(this, "StandardClusterArn", { value: cluster.clusterArn });
    new CfnOutput(this, "StandardTaskDefinitionArn", {
      value: taskDefinition.taskDefinitionArn,
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
  }
}
