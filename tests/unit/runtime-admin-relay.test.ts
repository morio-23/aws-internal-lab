import assert from "node:assert/strict";
import test from "node:test";

import { relayRuntimeAdmin } from "../../apps/control-plane/src/runtime-admin-relay.js";
import { generateRuntimeTokenKeyPair, signRuntimeToken } from "../../packages/runtime-auth/src/index.js";

test("BFF relays signed Worker admin calls only to the active Runtime endpoint", async () => {
  const keys = generateRuntimeTokenKeyPair();
  const identity = {
    workspaceId: "workspace-relay",
    sessionId: "session-relay",
    virtualAccountId: "012345678901",
    endpoint: "10.30.1.20:8080",
  };
  const authorization = "Bearer " + signRuntimeToken({ privateKeyPem: keys.privateKeyPem, ...identity });
  const seen: string[] = [];
  const input = {
    action: "persist" as const,
    identity,
    authorization,
    publicKeyPem: keys.publicKeyPem,
    resolveRuntime: async () => ({
      sessionId: identity.sessionId,
      virtualAccountId: identity.virtualAccountId,
      privateEndpoint: identity.endpoint,
    }),
    fetchImpl: async (url: RequestInfo | URL) => {
      seen.push(String(url));
      return new Response(null, { status: 200 });
    },
  };
  assert.equal(await relayRuntimeAdmin(input), 200);
  assert.deepEqual(seen, ["http://10.30.1.20:8080/admin/persist"]);
  assert.equal(await relayRuntimeAdmin({ ...input, authorization: "Bearer invalid" }), 401);
  assert.equal(await relayRuntimeAdmin({ ...input, identity: { ...identity, endpoint: "169.254.169.254:8080" } }), 400);
  assert.equal(await relayRuntimeAdmin({ ...input, resolveRuntime: async () => ({ ...identity, privateEndpoint: "10.30.1.21:8080" }) }), 409);
  assert.deepEqual(seen, ["http://10.30.1.20:8080/admin/persist"]);
});
