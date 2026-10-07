import {
  CreateSnapshotCommand,
  DeleteSnapshotCommand,
  DeleteVolumeCommand,
  DescribeSnapshotsCommand,
  EC2Client,
  type EC2ClientConfig,
} from "@aws-sdk/client-ec2";

export type StandardSnapshotCreateResult = {
  snapshotId: string;
};

export interface StandardSnapshotManager {
  createSnapshot(input: {
    volumeId: string;
    workspaceId: string;
    snapshotId: string;
  }): Promise<StandardSnapshotCreateResult>;
  deleteVolume(volumeId: string): Promise<void>;
  deleteSnapshot(snapshotId: string): Promise<void>;
}

type Ec2Sender = {
  send(
    command:
      | CreateSnapshotCommand
      | DescribeSnapshotsCommand
      | DeleteVolumeCommand
      | DeleteSnapshotCommand,
  ): Promise<unknown>;
};

export type AwsStandardSnapshotManagerConfig = {
  client?: Ec2Sender;
  clientConfig?: EC2ClientConfig;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
};

export class AwsStandardSnapshotManager implements StandardSnapshotManager {
  readonly #client: Ec2Sender;
  readonly #pollIntervalMs: number;
  readonly #maxPollAttempts: number;

  constructor(config: AwsStandardSnapshotManagerConfig = {}) {
    this.#client = config.client ?? new EC2Client(config.clientConfig ?? {});
    this.#pollIntervalMs = config.pollIntervalMs ?? 2_000;
    this.#maxPollAttempts = config.maxPollAttempts ?? 150;
  }

  async createSnapshot(input: {
    volumeId: string;
    workspaceId: string;
    snapshotId: string;
  }): Promise<StandardSnapshotCreateResult> {
    const created = (await this.#client.send(
      new CreateSnapshotCommand({
        VolumeId: input.volumeId,
        Description:
          "AWS Internal Lab " + input.workspaceId + " " + input.snapshotId,
        TagSpecifications: [
          {
            ResourceType: "snapshot",
            Tags: [
              { Key: "ManagedBy", Value: "aws-internal-lab" },
              { Key: "WorkspaceId", Value: input.workspaceId },
              { Key: "LabSnapshotId", Value: input.snapshotId },
            ],
          },
        ],
      }),
    )) as { SnapshotId?: string };

    const snapshotId = created.SnapshotId;
    if (!snapshotId) throw new Error("EBS_SNAPSHOT_CREATE_NO_ID");

    for (let attempt = 0; attempt < this.#maxPollAttempts; attempt += 1) {
      const described = (await this.#client.send(
        new DescribeSnapshotsCommand({
          SnapshotIds: [snapshotId],
        }),
      )) as {
        Snapshots?: Array<{ State?: string; StateMessage?: string }>;
      };
      const snapshot = described.Snapshots?.[0];
      if (snapshot?.State === "completed") return { snapshotId };
      if (snapshot?.State === "error") {
        throw new Error(
          "EBS_SNAPSHOT_FAILED:" + (snapshot.StateMessage ?? "unknown"),
        );
      }

      if (attempt + 1 < this.#maxPollAttempts) {
        await new Promise((resolve) =>
          setTimeout(resolve, this.#pollIntervalMs),
        );
      }
    }

    throw new Error("EBS_SNAPSHOT_TIMEOUT");
  }

  async deleteVolume(volumeId: string): Promise<void> {
    await this.#client.send(new DeleteVolumeCommand({ VolumeId: volumeId }));
  }

  async deleteSnapshot(snapshotId: string): Promise<void> {
    await this.#client.send(
      new DeleteSnapshotCommand({ SnapshotId: snapshotId }),
    );
  }
}
