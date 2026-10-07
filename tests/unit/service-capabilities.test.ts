import assert from "node:assert/strict";
import test from "node:test";

import {
  createCapabilityRegistry,
} from "../../packages/service-capabilities/src/index.js";

test("provider routing can differ by operation within one service", () => {
  const registry = createCapabilityRegistry([
    {
      serviceCode: "demo",
      operation: "*",
      provider: "ministack",
      runtimeRequirement: "standard",
      enabled: true,
    },
    {
      serviceCode: "demo",
      operation: "Explain",
      provider: "internal",
      runtimeRequirement: "standard",
      enabled: true,
    },
    {
      serviceCode: "demo",
      operation: "Dangerous",
      provider: "deny",
      runtimeRequirement: "standard",
      enabled: true,
    },
  ]);

  assert.equal(registry.resolve("demo", "List")?.provider, "ministack");
  assert.equal(registry.resolve("demo", "Explain")?.provider, "internal");
  assert.equal(registry.resolve("demo", "Dangerous")?.provider, "deny");
  assert.equal(registry.resolve("missing", "List"), null);
});
