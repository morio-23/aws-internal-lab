import assert from "node:assert/strict";
import test from "node:test";

import {
  generateRuntimeTokenKeyPair,
  signRuntimeToken,
  verifyRuntimeToken,
} from "../../packages/runtime-auth/src/index.js";

test("runtime token binds workspace session account and expiry", () => {
  const keys = generateRuntimeTokenKeyPair();
  const now = new Date("2026-10-07T10:00:00Z");
  const token = signRuntimeToken({
    privateKeyPem: keys.privateKeyPem,
    workspaceId: "workspace-1",
    sessionId: "session-1",
    virtualAccountId: "012345678901",
    now,
    ttlSeconds: 60,
  });

  const claims = verifyRuntimeToken({
    token,
    publicKeyPem: keys.publicKeyPem,
    expectedWorkspaceId: "workspace-1",
    expectedSessionId: "session-1",
    expectedVirtualAccountId: "012345678901",
    now: new Date("2026-10-07T10:00:30Z"),
  });
  assert.equal(claims.workspaceId, "workspace-1");

  assert.throws(
    () =>
      verifyRuntimeToken({
        token,
        publicKeyPem: keys.publicKeyPem,
        expectedWorkspaceId: "workspace-other",
        expectedSessionId: "session-1",
        expectedVirtualAccountId: "012345678901",
        now,
      }),
    /WORKSPACE/,
  );

  assert.throws(
    () =>
      verifyRuntimeToken({
        token,
        publicKeyPem: keys.publicKeyPem,
        expectedWorkspaceId: "workspace-1",
        expectedSessionId: "session-1",
        expectedVirtualAccountId: "012345678901",
        now: new Date("2026-10-07T10:02:00Z"),
      }),
    /EXPIRED/,
  );
});

test("runtime token rejects a signature from another key", () => {
  const signer = generateRuntimeTokenKeyPair();
  const verifier = generateRuntimeTokenKeyPair();
  const token = signRuntimeToken({
    privateKeyPem: signer.privateKeyPem,
    workspaceId: "workspace-1",
    sessionId: "session-1",
    virtualAccountId: "012345678901",
  });

  assert.throws(
    () =>
      verifyRuntimeToken({
        token,
        publicKeyPem: verifier.publicKeyPem,
        expectedWorkspaceId: "workspace-1",
        expectedSessionId: "session-1",
        expectedVirtualAccountId: "012345678901",
      }),
    /SIGNATURE/,
  );
});
