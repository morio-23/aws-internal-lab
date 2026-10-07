import { ECSClient } from "@aws-sdk/client-ecs";
import { EC2Client } from "@aws-sdk/client-ec2";
import { S3Client } from "@aws-sdk/client-s3";
import { pathToFileURL } from "node:url";

import {
  EcsStandardRuntimeProvisioner,
} from "../../../packages/runtime-control/src/standard-runtime.js";
import {
  AwsStandardSnapshotManager,
} from "../../../packages/runtime-control/src/standard-snapshot.js";
import {
  S3SnapshotManifestStore,
} from "../../../packages/runtime-control/src/snapshot-manifest.js";
import { SqsOperationQueue } from "./operation-queue.js";
import { runStandardWorkerCycle } from "./worker-cycle.js";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error("Missing required environment variable: " + name);
  }
  return value;
}

function csv(name: string): string[] {
  return required(name)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function createStandardRuntimeDependenciesFromEnvironment() {
  const region = process.env.AWS_REGION ?? "ap-northeast-1";

  return {
    provisioner: new EcsStandardRuntimeProvisioner({
      clusterArn: required("STANDARD_CLUSTER_ARN"),
      taskDefinitionArn: required("STANDARD_TASK_DEFINITION_ARN"),
      subnetIds: csv("STANDARD_SUBNET_IDS"),
      securityGroupIds: csv("STANDARD_SECURITY_GROUP_IDS"),
      ebsInfrastructureRoleArn: required("ECS_EBS_INFRASTRUCTURE_ROLE_ARN"),
      platformPublicKeyPem: Buffer.from(
        required("PLATFORM_RUNTIME_PUBLIC_KEY_B64"),
        "base64",
      ).toString("utf8"),
      client: new ECSClient({ region }),
    }),
    snapshotManager: new AwsStandardSnapshotManager({
      client: new EC2Client({ region }),
    }),
    manifestStore: new S3SnapshotManifestStore({
      bucket: required("SNAPSHOT_BUCKET_NAME"),
      client: new S3Client({ region }),
    }),
  };
}

export function createOperationWorkerBindingsFromEnvironment() {
  const databaseUrl = required("DATABASE_URL");
  const queueUrl = required("OPERATION_QUEUE_URL");
  const region = process.env.AWS_REGION ?? "ap-northeast-1";
  return {
    databaseUrl,
    queue: new SqsOperationQueue({ queueUrl, clientConfig: { region } }),
  };
}

export async function startOperationWorker(): Promise<void> {
  const bindings = createOperationWorkerBindingsFromEnvironment();
  const dependencies = createStandardRuntimeDependenciesFromEnvironment();
  for (;;) {
    try {
      await runStandardWorkerCycle({ ...bindings, ...dependencies });
    } catch {
      console.error("STANDARD_WORKER_CYCLE_FAILED");
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entrypoint === import.meta.url) {
  void startOperationWorker();
}
