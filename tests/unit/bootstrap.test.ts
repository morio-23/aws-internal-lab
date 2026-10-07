import assert from "node:assert/strict";
import test from "node:test";

import { packageName } from "../../packages/domain/src/index.js";

test("workspace bootstrap loads shared domain package", () => {
  assert.equal(packageName, "@aws-internal-lab/domain");
});
