import assert from "node:assert/strict";
import test from "node:test";

import { generateRuntimeTokenKeyPair } from "../../packages/runtime-auth/src/index.js";
import { createStandardRuntimeDependenciesFromEnvironment } from "../../apps/operation-worker/src/main.js";

test("operation worker requires all Standard Runtime infrastructure bindings", () => {
  const saved = { ...process.env };
  try {
    const pair = generateRuntimeTokenKeyPair();
    process.env.STANDARD_CLUSTER_ARN = "arn:aws:ecs:ap-northeast-1:123456789012:cluster/lab";
    process.env.STANDARD_TASK_DEFINITION_ARN = "arn:aws:ecs:ap-northeast-1:123456789012:task-definition/lab:1";
    process.env.STANDARD_SUBNET_IDS = "subnet-a,subnet-b";
    process.env.STANDARD_SECURITY_GROUP_IDS = "sg-runtime";
    process.env.ECS_EBS_INFRASTRUCTURE_ROLE_ARN = "arn:aws:iam::123456789012:role/ecs-ebs";
    process.env.SNAPSHOT_BUCKET_NAME = "snapshot-bucket";
    process.env.PLATFORM_RUNTIME_PUBLIC_KEY_B64 = Buffer.from(
      pair.publicKeyPem,
    ).toString("base64");

    const dependencies = createStandardRuntimeDependenciesFromEnvironment();
    assert.ok(dependencies.provisioner);
    assert.ok(dependencies.snapshotManager);
    assert.ok(dependencies.manifestStore);
  } finally {
    process.env = saved;
  }
});

test("operation worker fails closed when snapshot store binding is missing", () => {
  const saved = { ...process.env };
  try {
    const pair = generateRuntimeTokenKeyPair();
    process.env.STANDARD_CLUSTER_ARN = "cluster";
    process.env.STANDARD_TASK_DEFINITION_ARN = "task";
    process.env.STANDARD_SUBNET_IDS = "subnet-a,subnet-b";
    process.env.STANDARD_SECURITY_GROUP_IDS = "sg-runtime";
    process.env.ECS_EBS_INFRASTRUCTURE_ROLE_ARN = "role";
    delete process.env.SNAPSHOT_BUCKET_NAME;
    process.env.PLATFORM_RUNTIME_PUBLIC_KEY_B64 = Buffer.from(
      pair.publicKeyPem,
    ).toString("base64");

    assert.throws(
      () => createStandardRuntimeDependenciesFromEnvironment(),
      /SNAPSHOT_BUCKET_NAME/,
    );
  } finally {
    process.env = saved;
  }
});
