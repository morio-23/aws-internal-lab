import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";

import { hasPermission } from "../../../packages/domain/src/auth.js";
import { uuidv7 } from "../../../packages/domain/src/id.js";
import { createLifecycleOperation } from "../../../packages/db/src/lifecycle-repository.js";
import { getActiveRuntimeForWorkspace } from "../../../packages/db/src/runtime-repository.js";
import {
  createWorkspace,
  getWorkspaceForOwner,
  listWorkspacesForOwner,
} from "../../../packages/db/src/workspace-repository.js";
import { assertVirtualRegion } from "../../../packages/aws-virtual/src/index.js";
import { signRuntimeToken } from "../../../packages/runtime-auth/src/index.js";
import { prototypeCapabilityRegistry } from "../../../packages/service-capabilities/src/index.js";
import { resolvePrototypeIdentity } from "./auth.js";

const port = Number(process.env.PORT ?? "3001");

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function firstHeader(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function lifecycleRequestHash(
  workspaceId: string,
  operationType: string,
): string {
  return createHash("sha256")
    .update(`${workspaceId}:${operationType}`)
    .digest("hex");
}

export const server = createServer(async (request, response) => {
  try {
    if (request.url === "/healthz") {
      json(response, 200, { status: "ok" });
      return;
    }

    if (request.url === "/readyz") {
      json(response, 200, { status: "ready" });
      return;
    }

    const identity = resolvePrototypeIdentity(request.headers);
    if (!identity) {
      json(response, 401, { error: { code: "UNAUTHENTICATED" } });
      return;
    }

    if (request.url === "/api/v1/me" && request.method === "GET") {
      json(response, 200, { user: identity });
      return;
    }

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      json(response, 503, { error: { code: "DATABASE_UNAVAILABLE" } });
      return;
    }

    if (request.url === "/api/v1/workspaces" && request.method === "GET") {
      if (!hasPermission(identity, "workspace:read-own")) {
        json(response, 403, { error: { code: "FORBIDDEN" } });
        return;
      }

      const workspaces = await listWorkspacesForOwner({
        databaseUrl,
        ownerSubject: identity.subject,
      });
      json(response, 200, { items: workspaces });
      return;
    }

    if (request.url === "/api/v1/workspaces" && request.method === "POST") {
      if (!hasPermission(identity, "workspace:mutate-own")) {
        json(response, 403, { error: { code: "FORBIDDEN" } });
        return;
      }

      const body = (await readJsonBody(request)) as {
        primaryVirtualRegion?: string;
      };
      const workspace = await createWorkspace({
        databaseUrl,
        identity,
        ...(body.primaryVirtualRegion
          ? { primaryVirtualRegion: body.primaryVirtualRegion }
          : {}),
      });
      json(response, 201, { workspace });
      return;
    }

    const workspaceMatch = request.url?.match(/^\/api\/v1\/workspaces\/([0-9a-f-]+)$/);
    if (workspaceMatch && request.method === "GET") {
      if (!hasPermission(identity, "workspace:read-own")) {
        json(response, 403, { error: { code: "FORBIDDEN" } });
        return;
      }

      const workspaceId = workspaceMatch[1];
      if (!workspaceId) {
        json(response, 400, { error: { code: "INVALID_WORKSPACE_ID" } });
        return;
      }

      const workspace = await getWorkspaceForOwner({
        databaseUrl,
        workspaceId,
        ownerSubject: identity.subject,
      });

      if (!workspace) {
        json(response, 404, { error: { code: "WORKSPACE_NOT_FOUND" } });
        return;
      }

      json(response, 200, { workspace });
      return;
    }

    const serviceMatch = request.url?.match(
      /^\/api\/v1\/workspaces\/([0-9a-f-]+)\/services\/([a-z0-9-]+)\/([A-Za-z0-9]+)$/,
    );
    if (serviceMatch && request.method === "POST") {
      if (!hasPermission(identity, "workspace:mutate-own")) {
        json(response, 403, { error: { code: "FORBIDDEN" } });
        return;
      }

      const workspaceId = serviceMatch[1];
      const serviceCode = serviceMatch[2];
      const operation = serviceMatch[3];
      if (!workspaceId || !serviceCode || !operation) {
        json(response, 400, { error: { code: "INVALID_SERVICE_REQUEST" } });
        return;
      }

      const workspace = await getWorkspaceForOwner({
        databaseUrl,
        workspaceId,
        ownerSubject: identity.subject,
      });
      if (!workspace) {
        json(response, 404, { error: { code: "WORKSPACE_NOT_FOUND" } });
        return;
      }

      const runtime = await getActiveRuntimeForWorkspace({
        databaseUrl,
        workspaceId,
      });
      if (!runtime || runtime.runtimeStatus !== "ready" || !runtime.privateEndpoint) {
        json(response, 409, { error: { code: "WORKSPACE_NOT_ACTIVE" } });
        return;
      }

      const capability = prototypeCapabilityRegistry.resolve(
        serviceCode,
        operation,
      );
      if (!capability || !capability.enabled || capability.provider === "deny") {
        json(response, 404, { error: { code: "OPERATION_UNSUPPORTED" } });
        return;
      }
      if (capability.runtimeRequirement !== runtime.runtimeType) {
        json(response, 409, { error: { code: "RUNTIME_PROMOTION_REQUIRED" } });
        return;
      }

      const body = (await readJsonBody(request)) as {
        virtualRegion?: string;
        payload?: unknown;
      };
      const virtualRegion = body.virtualRegion ?? workspace.primaryVirtualRegion;
      assertVirtualRegion(virtualRegion);
      if (!workspace.enabledRegions.includes(virtualRegion)) {
        json(response, 400, { error: { code: "INVALID_VIRTUAL_REGION" } });
        return;
      }

      const privateKeyB64 = process.env.PLATFORM_RUNTIME_PRIVATE_KEY_B64;
      if (!privateKeyB64) {
        json(response, 503, { error: { code: "RUNTIME_AUTH_UNAVAILABLE" } });
        return;
      }
      const privateKeyPem = Buffer.from(privateKeyB64, "base64").toString("utf8");
      const correlationId =
        firstHeader(request.headers["x-correlation-id"]) ?? uuidv7();
      const token = signRuntimeToken({
        privateKeyPem,
        workspaceId,
        sessionId: runtime.sessionId,
        virtualAccountId: runtime.virtualAccountId,
        ttlSeconds: 30,
      });

      const gatewayResponse = await fetch(
        "http://" + runtime.privateEndpoint + "/invoke",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: "Bearer " + token,
          },
          body: JSON.stringify({
            virtualRegion,
            serviceCode,
            operation,
            ...(body.payload === undefined ? {} : { payload: body.payload }),
            correlationId,
          }),
          signal: AbortSignal.timeout(10_000),
        },
      );

      const gatewayBody = (await gatewayResponse.json()) as unknown;
      json(response, gatewayResponse.status, gatewayBody);
      return;
    }

    const lifecycleMatch = request.url?.match(
      /^\/api\/v1\/workspaces\/([0-9a-f-]+)\/(start|stop)$/,
    );
    if (lifecycleMatch && request.method === "POST") {
      if (!hasPermission(identity, "workspace:mutate-own")) {
        json(response, 403, { error: { code: "FORBIDDEN" } });
        return;
      }

      const workspaceId = lifecycleMatch[1];
      const operationType = lifecycleMatch[2];
      if (!workspaceId || !operationType) {
        json(response, 400, { error: { code: "INVALID_LIFECYCLE_REQUEST" } });
        return;
      }

      const workspace = await getWorkspaceForOwner({
        databaseUrl,
        workspaceId,
        ownerSubject: identity.subject,
      });
      if (!workspace) {
        json(response, 404, { error: { code: "WORKSPACE_NOT_FOUND" } });
        return;
      }

      const idempotencyKey = firstHeader(request.headers["idempotency-key"]);
      if (!idempotencyKey) {
        json(response, 400, { error: { code: "IDEMPOTENCY_KEY_REQUIRED" } });
        return;
      }

      const correlationId =
        firstHeader(request.headers["x-correlation-id"]) ?? uuidv7();

      const result = await createLifecycleOperation({
        databaseUrl,
        workspaceId,
        idempotencyKey,
        operationType,
        requestedBy: identity.subject,
        correlationId,
        requestHash: lifecycleRequestHash(workspaceId, operationType),
      });

      json(response, 202, {
        operationId: result.operation.id,
        status: result.operation.status,
        created: result.created,
        correlationId,
      });
      return;
    }

    json(response, 404, { error: { code: "NOT_FOUND" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    const invalidRegion = /Unsupported virtual region/.test(message);
    const conflict =
      message === "IDEMPOTENCY_KEY_CONFLICT" ||
      message === "WORKSPACE_BUSY";
    const status = invalidRegion ? 400 : conflict ? 409 : 500;
    json(response, status, {
      error: {
        code: invalidRegion
          ? "INVALID_VIRTUAL_REGION"
          : conflict
            ? message
            : "INTERNAL_ERROR",
      },
    });
  }
});

export function startServer(): void {
  server.listen(port, "0.0.0.0", () => {
    console.log(`control-plane listening on :${port}`);
  });
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entrypoint === import.meta.url) {
  startServer();
}
