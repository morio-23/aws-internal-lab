import assert from "node:assert/strict";
import test from "node:test";

import { AssumeRoleCommand } from "@aws-sdk/client-sts";

import { createRuntimeAccountClients, createRuntimeAccountCredentials } from "../../apps/operation-worker/src/runtime-account-credentials.js";

test("worker assumes only the configured Runtime role before creating Runtime API clients", async () => {
  const seen: AssumeRoleCommand[] = [];
  const credentials = createRuntimeAccountCredentials({
    roleArn: "arn:aws:iam::123456789012:role/aws-internal-lab-runtime-orchestrator",
    client: {
      async send(command) {
        seen.push(command);
        return {
          Credentials: {
            AccessKeyId: "temporary-access-key",
            SecretAccessKey: "temporary-secret-key",
            SessionToken: "temporary-session-token",
            Expiration: new Date(Date.now() + 60_000),
          },
        };
      },
    },
  });
  const result = await credentials();
  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.input.RoleArn, "arn:aws:iam::123456789012:role/aws-internal-lab-runtime-orchestrator");
  assert.equal(result.accessKeyId, "temporary-access-key");
  assert.equal(result.sessionToken, "temporary-session-token");
});

test("worker rejects incomplete STS credentials", async () => {
  const credentials = createRuntimeAccountCredentials({
    roleArn: "arn:aws:iam::123456789012:role/aws-internal-lab-runtime-orchestrator",
    client: { async send() { return { Credentials: { AccessKeyId: "partial" } }; } },
  });
  await assert.rejects(credentials(), /RUNTIME_ASSUME_ROLE_FAILED/);
});

test("all Runtime API clients use the assumed role credentials", async () => {
  const clients = createRuntimeAccountClients({
    region: "ap-northeast-1",
    credentials: async () => ({
      accessKeyId: "assumed-access-key",
      secretAccessKey: "assumed-secret-key",
      sessionToken: "assumed-token",
    }),
  });
  for (const client of [clients.ecs, clients.ec2, clients.s3]) {
    const resolved = await client.config.credentials();
    assert.equal(resolved.accessKeyId, "assumed-access-key");
    assert.equal(resolved.sessionToken, "assumed-token");
  }
});
