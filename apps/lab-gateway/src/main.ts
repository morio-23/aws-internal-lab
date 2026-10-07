import { pathToFileURL } from "node:url";

import {
  createLabCredential,
  type LabBinding,
} from "./index.js";
import { MiniStackProvider } from "./providers/ministack.js";
import { createLabGatewayServer } from "./server.js";
import {
  assertVirtualRegion,
  type VirtualRegion,
} from "../../../packages/aws-virtual/src/index.js";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error("Missing required environment variable: " + name);
  return value;
}

function parseRegions(value: string): VirtualRegion[] {
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("LAB_ENABLED_REGIONS must be a non-empty JSON array");
  }

  return parsed.map((region) => {
    if (typeof region !== "string") {
      throw new Error("LAB_ENABLED_REGIONS contains a non-string value");
    }
    assertVirtualRegion(region);
    return region;
  });
}

export function createRuntimeGatewayFromEnvironment() {
  const workspaceId = required("LAB_WORKSPACE_ID");
  const sessionId = required("LAB_SESSION_ID");
  const virtualAccountId = required("LAB_VIRTUAL_ACCOUNT_ID");
  const enabledRegions = parseRegions(required("LAB_ENABLED_REGIONS"));

  const binding: LabBinding = {
    workspaceId,
    sessionId,
    virtualAccountId,
    enabledRegions,
    credential: createLabCredential({
      virtualAccountId,
      sessionId,
    }),
  };

  const publicKeyB64 = process.env.PLATFORM_RUNTIME_PUBLIC_KEY_B64;
  const platformPublicKeyPem = publicKeyB64
    ? Buffer.from(publicKeyB64, "base64").toString("utf8")
    : undefined;

  return createLabGatewayServer({
    binding,
    providers: [
      new MiniStackProvider({
        endpoint: process.env.MINISTACK_ENDPOINT ?? "http://127.0.0.1:4566",
      }),
    ],
    ...(platformPublicKeyPem ? { platformPublicKeyPem } : {}),
  });
}

export function startRuntimeGateway(): void {
  const port = Number(process.env.PORT ?? "8080");
  const server = createRuntimeGatewayFromEnvironment();
  server.listen(port, "0.0.0.0", () => {
    console.log("lab-gateway listening on :" + port);
  });
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entrypoint === import.meta.url) {
  startRuntimeGateway();
}
