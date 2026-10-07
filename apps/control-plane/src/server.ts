import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";

import { hasPermission } from "../../../packages/domain/src/auth.js";
import {
  createWorkspace,
  getWorkspaceForOwner,
  listWorkspacesForOwner,
} from "../../../packages/db/src/workspace-repository.js";
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

    json(response, 404, { error: { code: "NOT_FOUND" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    const status = /Unsupported virtual region/.test(message) ? 400 : 500;
    json(response, status, {
      error: {
        code: status === 400 ? "INVALID_VIRTUAL_REGION" : "INTERNAL_ERROR",
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
