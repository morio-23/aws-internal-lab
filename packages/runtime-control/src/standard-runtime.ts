import {
  DescribeTasksCommand,
  ECSClient,
  RunTaskCommand,
  StopTaskCommand,
  type DescribeTasksCommandOutput,
  type ECSClientConfig,
  type RunTaskCommandOutput,
} from "@aws-sdk/client-ecs";

export type StandardRuntimeIdentity = {
  workspaceId: string;
  sessionId: string;
  virtualAccountId: string;
  enabledRegions: readonly string[];
  restoreSnapshotId?: string;
};

export type StandardRuntimeStartResult = {
  taskArn: string;
};

export type StandardRuntimeInspection = {
  state: "running" | "stopped" | "missing";
  taskArn: string;
  privateIpv4Address?: string;
  stoppedReason?: string;
};

export interface StandardRuntimeProvisioner {
  start(identity: StandardRuntimeIdentity): Promise<StandardRuntimeStartResult>;
  stop(taskArn: string, reason: string): Promise<void>;
  inspect(taskArn: string): Promise<StandardRuntimeInspection>;
}

type EcsSender = {
  send(
    command: RunTaskCommand | StopTaskCommand | DescribeTasksCommand,
  ): Promise<unknown>;
};

export type EcsStandardRuntimeProvisionerConfig = {
  clusterArn: string;
  taskDefinitionArn: string;
  subnetIds: readonly string[];
  securityGroupIds: readonly string[];
  ebsInfrastructureRoleArn: string;
  ebsSizeGiB?: number;
  platformPublicKeyPem?: string;
  client?: EcsSender;
  clientConfig?: ECSClientConfig;
};

function env(name: string, value: string) {
  return { name, value };
}

export class EcsStandardRuntimeProvisioner
  implements StandardRuntimeProvisioner
{
  readonly #client: EcsSender;
  readonly #clusterArn: string;
  readonly #taskDefinitionArn: string;
  readonly #subnetIds: readonly string[];
  readonly #securityGroupIds: readonly string[];
  readonly #ebsInfrastructureRoleArn: string;
  readonly #ebsSizeGiB: number;
  readonly #platformPublicKeyPem: string | undefined;

  constructor(config: EcsStandardRuntimeProvisionerConfig) {
    if (config.subnetIds.length < 2) {
      throw new Error("Standard Runtime requires subnets in at least two AZs");
    }
    if (config.securityGroupIds.length === 0) {
      throw new Error("Standard Runtime requires at least one security group");
    }

    if (config.client) {
      this.#client = config.client;
    } else {
      const ecs = new ECSClient(config.clientConfig ?? {});
      this.#client = {
        async send(command) {
          if (command instanceof RunTaskCommand) return ecs.send(command);
          if (command instanceof StopTaskCommand) return ecs.send(command);
          return ecs.send(command);
        },
      };
    }
    this.#clusterArn = config.clusterArn;
    this.#taskDefinitionArn = config.taskDefinitionArn;
    this.#subnetIds = config.subnetIds;
    this.#securityGroupIds = config.securityGroupIds;
    this.#ebsInfrastructureRoleArn = config.ebsInfrastructureRoleArn;
    this.#ebsSizeGiB = config.ebsSizeGiB ?? 8;
    this.#platformPublicKeyPem = config.platformPublicKeyPem;
  }

  async start(
    identity: StandardRuntimeIdentity,
  ): Promise<StandardRuntimeStartResult> {
    const result = (await this.#client.send(
      new RunTaskCommand({
        cluster: this.#clusterArn,
        taskDefinition: this.#taskDefinitionArn,
        launchType: "FARGATE",
        count: 1,
        enableExecuteCommand: false,
        networkConfiguration: {
          awsvpcConfiguration: {
            assignPublicIp: "DISABLED",
            subnets: [...this.#subnetIds],
            securityGroups: [...this.#securityGroupIds],
          },
        },
        startedBy: "aws-internal-lab-control-plane",
        group: `workspace:${identity.workspaceId}`,
        tags: [
          { key: "ManagedBy", value: "aws-internal-lab" },
          { key: "WorkspaceId", value: identity.workspaceId },
          { key: "SessionId", value: identity.sessionId },
          { key: "VirtualAccountId", value: identity.virtualAccountId },
        ],
        volumeConfigurations: [
          {
            name: "lab-state",
            managedEBSVolume: {
              roleArn: this.#ebsInfrastructureRoleArn,
              volumeType: "gp3",
              encrypted: true,
              filesystemType: "ext4",
              terminationPolicy: {
                deleteOnTermination: false,
              },
              ...(identity.restoreSnapshotId
                ? { snapshotId: identity.restoreSnapshotId }
                : { sizeInGiB: this.#ebsSizeGiB }),
            },
          },
        ],
        overrides: {
          containerOverrides: [
            {
              name: "lab-gateway",
              environment: [
                env("LAB_WORKSPACE_ID", identity.workspaceId),
                env("LAB_SESSION_ID", identity.sessionId),
                env("LAB_VIRTUAL_ACCOUNT_ID", identity.virtualAccountId),
                env(
                  "LAB_ENABLED_REGIONS",
                  JSON.stringify(identity.enabledRegions),
                ),
                ...(this.#platformPublicKeyPem
                  ? [
                      env(
                        "PLATFORM_RUNTIME_PUBLIC_KEY_B64",
                        Buffer.from(this.#platformPublicKeyPem).toString("base64"),
                      ),
                    ]
                  : []),
              ],
            },
            {
              name: "ministack",
              environment: [
                env("LAB_WORKSPACE_ID", identity.workspaceId),
                env("LAB_VIRTUAL_ACCOUNT_ID", identity.virtualAccountId),
              ],
            },
          ],
        },
      }),
    )) as RunTaskCommandOutput;

    const failure = result.failures?.[0];
    if (failure) {
      throw new Error(
        `ECS_RUN_TASK_FAILED:${failure.reason ?? failure.detail ?? "unknown"}`,
      );
    }

    const taskArn = result.tasks?.[0]?.taskArn;
    if (!taskArn) {
      throw new Error("ECS_RUN_TASK_NO_TASK");
    }

    return { taskArn };
  }

  async stop(taskArn: string, reason: string): Promise<void> {
    await this.#client.send(
      new StopTaskCommand({
        cluster: this.#clusterArn,
        task: taskArn,
        reason,
      }),
    );
  }

  async inspect(taskArn: string): Promise<StandardRuntimeInspection> {
    const result = (await this.#client.send(
      new DescribeTasksCommand({
        cluster: this.#clusterArn,
        tasks: [taskArn],
      }),
    )) as DescribeTasksCommandOutput;

    if (result.failures?.length || !result.tasks?.[0]) {
      return { state: "missing", taskArn };
    }

    const task = result.tasks[0];
    const details = task.attachments?.flatMap(
      (attachment) => attachment.details ?? [],
    );
    const privateIpv4Address = details?.find(
      (detail) => detail.name === "privateIPv4Address",
    )?.value;

    const state =
      task.lastStatus === "STOPPED" || task.desiredStatus === "STOPPED"
        ? "stopped"
        : "running";

    return {
      state,
      taskArn,
      ...(privateIpv4Address ? { privateIpv4Address } : {}),
      ...(task.stoppedReason ? { stoppedReason: task.stoppedReason } : {}),
    };
  }
}
