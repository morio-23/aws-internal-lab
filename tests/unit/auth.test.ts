import assert from "node:assert/strict";
import test from "node:test";

import { resolvePrototypeIdentity } from "../../apps/control-plane/src/auth.js";
import {
  hasPermission,
  requirePermission,
} from "../../packages/domain/src/auth.js";

test("prototype auth resolves a learner in non-production", () => {
  const identity = resolvePrototypeIdentity({
    "x-prototype-user": "user-1",
    "x-prototype-role": "Learner",
  });

  assert.ok(identity);
  assert.equal(identity.subject, "user-1");
  assert.equal(hasPermission(identity, "workspace:mutate-own"), true);
  assert.equal(hasPermission(identity, "config:write"), false);
});

test("prototype auth is disabled in production", () => {
  const identity = resolvePrototypeIdentity(
    {
      "x-prototype-user": "user-1",
      "x-prototype-role": "Administrator",
    },
    "production",
  );

  assert.equal(identity, null);
});

test("security auditor cannot mutate workspaces", () => {
  const identity = {
    subject: "auditor-1",
    roles: ["SecurityAuditor"] as const,
  };

  assert.equal(hasPermission(identity, "audit:read"), true);
  assert.equal(hasPermission(identity, "workspace:mutate-own"), false);
  assert.throws(() => requirePermission(identity, "workspace:mutate-own"));
});
