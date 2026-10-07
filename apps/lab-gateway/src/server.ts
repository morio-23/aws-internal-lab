import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import {
  dispatchLabRequest,
  LabGatewayError,
  type LabBinding,
  type LabGatewayRequest,
  type ProviderAdapter,
} from "./index.js";
import type { CapabilityRegistry } from "../../../packages/service-capabilities/src/index.js";

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

export function createLabGatewayServer(input: {
  binding: LabBinding;
  providers: readonly ProviderAdapter[];
  registry?: CapabilityRegistry;
}) {
  return createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/healthz") {
        json(response, 200, { status: "ok" });
        return;
      }

      if (request.method !== "POST" || request.url !== "/invoke") {
        json(response, 404, { error: { code: "NOT_FOUND" } });
        return;
      }

      const body = (await readJsonBody(request)) as LabGatewayRequest;
      const result = await dispatchLabRequest({
        binding: input.binding,
        request: body,
        ...(input.registry ? { registry: input.registry } : {}),
        providers: input.providers,
      });

      json(response, 200, {
        correlationId: body.correlationId,
        result,
      });
    } catch (error) {
      if (error instanceof LabGatewayError) {
        const status =
          error.code === "OPERATION_UNSUPPORTED"
            ? 404
            : error.code === "OPERATION_DENIED" ||
                error.code === "OPERATION_DISABLED"
              ? 403
              : 401;
        json(response, status, {
          error: {
            code: error.code,
          },
        });
        return;
      }

      if (
        error instanceof Error &&
        error.message.startsWith("Unsupported virtual region:")
      ) {
        json(response, 400, {
          error: {
            code: "INVALID_REGION",
          },
        });
        return;
      }

      json(response, 500, {
        error: {
          code: "INTERNAL_ERROR",
        },
      });
    }
  });
}
