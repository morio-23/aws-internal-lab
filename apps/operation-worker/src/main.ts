import { ECSClient } from "@aws-sdk/client-ecs";
import { EC2Client } from "@aws-sdk/client-ec2";
import { S3Client } from "@aws-sdk/client-s3";

import {
  EcsStandardRuntimeProvisioner,
} from "../../../packages/runtime-control/src/standard-runtime.js";
import {
  AwsStandardSnapshotManager,
} from "../../../packages/runtime-control/src/standard-snapshot.js";
import {
  S3SnapshotManifestStore,
} from "../../../packages/runtime-control/src/snapshot-manifest.js";

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
