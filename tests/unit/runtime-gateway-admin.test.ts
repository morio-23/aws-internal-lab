import assert from "node:assert/strict";
import test from "node:test";

import { HttpRuntimeGatewayAdmin } from "../../apps/operation-worker/src/runtime-gateway-admin.js";
import {
  generateRuntimeTokenKeyPair,
  verifyRuntimeToken,
} from "../../packages/runtime-auth/src/index.js";

test("gateway admin signs quiesce calls and only targets the Runtime VPC endpoint", async () => {
  const keys = generateRuntimeTokenKeyPair();
  const seen: Array<{ url: string; authorization: string }> = [];
  const admin = new HttpRuntimeGatewayAdmin({
    privateKeyPem: keys.privateKeyPem,
    fetchImpl: async (input, init) => {
      const authorization = new Headers(init?.headers).get("authorization") ?? "";
      seen.push({ url: String(input), authorization });
      return new Response(null, { status: 200 });
    },
  });

  const identity = {
    endpoint: "10.30.1.20:8080",
    workspaceId: "workspace-admin",
    sessionId: "session-admin",
    virtualAccountId: "012345678901",
  };
  await admin.quiesce(identity);

  assert.equal(seen[0]?.url, "http://10.30.1.20:8080/admin/quiesce");
  assert.match(seen[0]?.authorization ?? "", /^Bearer /);
  verifyRuntimeToken({
    token: (seen[0]?.authorization ?? "").slice("Bearer ".length),
    publicKeyPem: keys.publicKeyPem,
    expectedWorkspaceId: identity.workspaceId,
    expectedSessionId: identity.sessionId,
    expectedVirtualAccountId: identity.virtualAccountId,
  });

  await assert.rejects(
    () => admin.quiesce({ ...identity, endpoint: "169.254.169.254:8080" }),
    /INVALID_RUNTIME_GATEWAY_ENDPOINT/,
  );
  await assert.rejects(
    () => admin.quiesce({ ...identity, endpoint: "example.com:8080" }),
    /INVALID_RUNTIME_GATEWAY_ENDPOINT/,
  );
});
