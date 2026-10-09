import { ECSClient } from "@aws-sdk/client-ecs";
import { EC2Client } from "@aws-sdk/client-ec2";
import { S3Client } from "@aws-sdk/client-s3";
import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";

type AssumedCredentials = {
  AccessKeyId?: string;
  SecretAccessKey?: string;
  SessionToken?: string;
  Expiration?: Date;
};

type StsSender = {
  send(command: AssumeRoleCommand): Promise<{ Credentials?: AssumedCredentials }>;
};

export function createRuntimeAccountCredentials(input: {
  roleArn: string;
  region?: string;
  client?: StsSender;
}) {
  if (!new RegExp("^arn:[^:]+:iam::[0-9]{12}:role/[A-Za-z0-9_+=,.@/-]+$").test(input.roleArn)) {
    throw new Error("INVALID_RUNTIME_ORCHESTRATOR_ROLE_ARN");
  }
  const client = input.client ?? new STSClient(input.region ? { region: input.region } : {});
  let cached: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken: string;
    expiration: Date;
  } | undefined;

  return async () => {
    if (cached && cached.expiration.getTime() - Date.now() > 5 * 60_000) {
      return cached;
    }
    const response = await client.send(new AssumeRoleCommand({
      RoleArn: input.roleArn,
      RoleSessionName: "aws-internal-lab-operation-worker",
      DurationSeconds: 3600,
    }));
    const value = response.Credentials;
    if (!value?.AccessKeyId || !value.SecretAccessKey || !value.SessionToken || !value.Expiration) {
      throw new Error("RUNTIME_ASSUME_ROLE_FAILED");
    }
    cached = {
      accessKeyId: value.AccessKeyId,
      secretAccessKey: value.SecretAccessKey,
      sessionToken: value.SessionToken,
      expiration: value.Expiration,
    };
    return cached;
  };
}

export function createRuntimeAccountClients(input: {
  region: string;
  credentials: () => Promise<{
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken: string;
    expiration?: Date;
  }>;
}) {
  return {
    ecs: new ECSClient({ region: input.region, credentials: input.credentials }),
    ec2: new EC2Client({ region: input.region, credentials: input.credentials }),
    s3: new S3Client({ region: input.region, credentials: input.credentials }),
  };
}
