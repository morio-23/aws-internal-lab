import assert from "node:assert/strict";
import test from "node:test";

import { appName as webApp } from "../../apps/web/src/index.js";
import { appName as controlPlaneApp } from "../../apps/control-plane/src/index.js";
import { appName as operationWorkerApp } from "../../apps/operation-worker/src/index.js";
import { appName as labGatewayApp } from "../../apps/lab-gateway/src/index.js";
import { packageName as domainPackage } from "../../packages/domain/src/index.js";
import { packageName as dbPackage } from "../../packages/db/src/index.js";
import { packageName as virtualAwsPackage } from "../../packages/aws-virtual/src/index.js";
import { packageName as capabilityPackage } from "../../packages/service-capabilities/src/index.js";
import { packageName as observabilityPackage } from "../../packages/observability/src/index.js";
import { packageName as testUtilsPackage } from "../../packages/test-utils/src/index.js";

test("workspace bootstrap loads app entry points", () => {
  assert.deepEqual(
    [webApp, controlPlaneApp, operationWorkerApp, labGatewayApp],
    ["web", "control-plane", "operation-worker", "lab-gateway"],
  );
});

test("workspace bootstrap loads shared package entry points", () => {
  assert.deepEqual(
    [
      domainPackage,
      dbPackage,
      virtualAwsPackage,
      capabilityPackage,
      observabilityPackage,
      testUtilsPackage,
    ],
    [
      "@aws-internal-lab/domain",
      "@aws-internal-lab/db",
      "@aws-internal-lab/aws-virtual",
      "@aws-internal-lab/service-capabilities",
      "@aws-internal-lab/observability",
      "@aws-internal-lab/test-utils",
    ],
  );
});
