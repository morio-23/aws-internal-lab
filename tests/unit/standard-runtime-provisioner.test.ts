import assert from "node:assert/strict";
import test from "node:test";

import {
  DescribeTasksCommand,
  ListTasksCommand,
  RunTaskCommand,
  StopTaskCommand,
} from "@aws-sdk/client-ecs";

import {
  EcsStandardRuntimeProvisioner,
} from "../../packages/runtime-control/src/standard-runtime.js";

test("Fargate provisioner launches a private task bound to workspace identity", async () => {
  const seen: unknown[] = [];
  const client = {
    async send(command: RunTaskCommand | StopTaskCommand | DescribeTasksCommand) {
      seen.push(command);
      if (command instanceof RunTaskCommand) {
        return { tasks: [{ taskArn: "arn:aws:ecs:ap-northeast-1:123:task/demo" }] };
      }
      return {};
    },
  };

  const provisioner = new EcsStandardRuntimeProvisioner({
    clusterArn: "cluster-arn",
    taskDefinitionArn: "task-def-arn",
    subnetIds: ["subnet-a", "subnet-b"],
    securityGroupIds: ["sg-runtime"],
    ebsInfrastructureRoleArn: "arn:aws:iam::123456789012:role/ecs-ebs",
    client,
  });

  const result = await provisioner.start({
    workspaceId: "workspace-1",
    sessionId: "session-1",
    virtualAccountId: "012345678901",
    enabledRegions: ["ap-northeast-1", "ap-northeast-3"],
  });

  assert.match(result.taskArn, /task\/demo$/);
  const command = seen[0];
  assert.equal(command instanceof RunTaskCommand, true);
  const input = (command as RunTaskCommand).input;
  assert.equal(
    input.networkConfiguration?.awsvpcConfiguration?.assignPublicIp,
    "DISABLED",
  );
  assert.deepEqual(
    input.networkConfiguration?.awsvpcConfiguration?.subnets,
    ["subnet-a", "subnet-b"],
  );
  assert.equal(input.enableExecuteCommand, false);
  assert.deepEqual(input.volumeConfigurations, [
    {
      name: "lab-state",
      managedEBSVolume: {
        roleArn: "arn:aws:iam::123456789012:role/ecs-ebs",
        volumeType: "gp3",
        encrypted: true,
        filesystemType: "ext4",
        terminationPolicy: {
          deleteOnTermination: false,
        },
        sizeInGiB: 8,
      },
    },
  ]);
  assert.equal(
    input.tags?.some(
      (tag) => tag.key === "WorkspaceId" && tag.value === "workspace-1",
    ),
    true,
  );

  const environment =
    input.overrides?.containerOverrides?.flatMap(
      (container) => container.environment ?? [],
    ) ?? [];
  assert.equal(
    environment.some((item) => /SECRET|PASSWORD|TOKEN/.test(item.name ?? "")),
    false,
  );
});

test("Fargate provisioner stops and inspects tasks", async () => {
  const client = {
    async send(command: RunTaskCommand | StopTaskCommand | DescribeTasksCommand) {
      if (command instanceof DescribeTasksCommand) {
        return {
          tasks: [
            {
              taskArn: "task-1",
              lastStatus: "RUNNING",
              desiredStatus: "RUNNING",
              attachments: [
                {
                  type: "ElasticNetworkInterface",
                  details: [
                    { name: "privateIPv4Address", value: "10.30.1.20" },
                  ],
                },
                {
                  type: "AmazonElasticBlockStorage",
                  details: [
                    { name: "volumeId", value: "vol-123" },
                    { name: "volumeName", value: "lab-state" },
                  ],
                },
              ],
            },
          ],
        };
      }
      return {};
    },
  };

  const provisioner = new EcsStandardRuntimeProvisioner({
    clusterArn: "cluster-arn",
    taskDefinitionArn: "task-def-arn",
    subnetIds: ["subnet-a", "subnet-b"],
    securityGroupIds: ["sg-runtime"],
    ebsInfrastructureRoleArn: "arn:aws:iam::123456789012:role/ecs-ebs",
    client,
  });

  assert.deepEqual(await provisioner.inspect("task-1"), {
    state: "running",
    taskArn: "task-1",
    privateIpv4Address: "10.30.1.20",
    stateVolumeId: "vol-123",
  });

  await provisioner.stop("task-1", "prototype stop");
});

test("Fargate provisioner rejects a single-subnet configuration", () => {
  assert.throws(
    () =>
      new EcsStandardRuntimeProvisioner({
        clusterArn: "cluster-arn",
        taskDefinitionArn: "task-def-arn",
        subnetIds: ["subnet-a"],
        securityGroupIds: ["sg-runtime"],
        ebsInfrastructureRoleArn: "arn:aws:iam::123456789012:role/ecs-ebs",
        client: { async send() { return {}; } },
      }),
    /at least two AZs/,
  );
});

test("Fargate provisioner inventories only tagged managed tasks across pages", async () => {
  const client = {
    async send(command: RunTaskCommand | StopTaskCommand | DescribeTasksCommand | ListTasksCommand) {
      if (command instanceof ListTasksCommand) {
        return command.input.nextToken
          ? { taskArns: ["task-c"] }
          : { taskArns: ["task-a", "task-b"], nextToken: "page-2" };
      }
      if (command instanceof DescribeTasksCommand) {
        return {
          tasks: command.input.tasks?.map((taskArn) => ({
            taskArn,
            createdAt: new Date("2026-10-07T00:00:00.000Z"),
            tags: taskArn === "task-b" ? [] : [{ key: "ManagedBy", value: "aws-internal-lab" }],
          })),
        };
      }
      return {};
    },
  };
  const provisioner = new EcsStandardRuntimeProvisioner({
    clusterArn: "cluster-arn",
    taskDefinitionArn: "task-def-arn",
    subnetIds: ["subnet-a", "subnet-b"],
    securityGroupIds: ["sg-runtime"],
    ebsInfrastructureRoleArn: "arn:aws:iam::123456789012:role/ecs-ebs",
    client,
  });

  assert.deepEqual(await provisioner.listManagedTasks(), [
    { taskArn: "task-a", createdAt: new Date("2026-10-07T00:00:00.000Z") },
    { taskArn: "task-c", createdAt: new Date("2026-10-07T00:00:00.000Z") },
  ]);
});
