import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import {
  dispatchLabRequest,
  LabGatewayError,
  type LabBinding,
  type LabGatewayRequest,
  type ProviderAdapter,
} from "./index.js";
import type { CapabilityRegistry } from "../../../packages/service-capabilities/src/index.js";
import { verifyRuntimeToken } from "../../../packages/runtime-auth/src/index.js";

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
  platformPublicKeyPem?: string;
  quiesceTimeoutMs?: number;
}) {
  let quiescing = false;
  let activeInvocations = 0;
  const drainWaiters = new Set<() => void>();

  function verifyPlatformRequest(request: IncomingMessage): void {
    if (!input.platformPublicKeyPem) {
      throw new Error("INVALID_RUNTIME_TOKEN:PLATFORM_KEY_UNAVAILABLE");
    }
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) {
      throw new Error("INVALID_RUNTIME_TOKEN:MISSING");
    }
    verifyRuntimeToken({
      token: authorization.slice("Bearer ".length),
      publicKeyPem: input.platformPublicKeyPem,
      expectedWorkspaceId: input.binding.workspaceId,
      expectedSessionId: input.binding.sessionId,
      expectedVirtualAccountId: input.binding.virtualAccountId,
    });
  }

  function invocationFinished(): void {
    activeInvocations -= 1;
    if (activeInvocations === 0) {
      for (const resolve of drainWaiters) resolve();
      drainWaiters.clear();
    }
  }

  async function waitForDrain(): Promise<boolean> {
    if (activeInvocations === 0) return true;
    const timeoutMs = input.quiesceTimeoutMs ?? 30_000;
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (value: boolean) => {
        if (settled) return;
        settled = true;
        drainWaiters.delete(onDrain);
        resolve(value);
      };
      const onDrain = () => finish(true);
      drainWaiters.add(onDrain);
      const timer = setTimeout(() => finish(false), timeoutMs);
      timer.unref?.();
    });
  }

  return createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/healthz") {
        json(response, 200, {
          status: "ok",
          quiescing,
          activeInvocations,
        });
        return;
      }

      if (request.method === "POST" && request.url === "/admin/quiesce") {
        verifyPlatformRequest(request);
        quiescing = true;
        const drained = await waitForDrain();
        if (!drained) {
          json(response, 503, {
            error: { code: "QUIESCE_TIMEOUT" },
            activeInvocations,
          });
          return;
        }
        json(response, 200, {
          status: "quiesced",
          activeInvocations,
        });
        return;
      }

      if (request.method === "POST" && request.url === "/admin/unquiesce") {
        verifyPlatformRequest(request);
        quiescing = false;
        json(response, 200, {
          status: "ready",
          activeInvocations,
        });
        return;
      }

      if (request.method !== "POST" || request.url !== "/invoke") {
        json(response, 404, { error: { code: "NOT_FOUND" } });
        return;
      }

      if (quiescing) {
        json(response, 409, { error: { code: "RUNTIME_QUIESCING" } });
        return;
      }

      activeInvocations += 1;
      try {
        const rawBody = (await readJsonBody(request)) as Partial<LabGatewayRequest>;
        const authorization = request.headers.authorization;
        let body: LabGatewayRequest;

        if (
          input.platformPublicKeyPem &&
          authorization?.startsWith("Bearer ")
        ) {
          const token = authorization.slice("Bearer ".length);
          verifyRuntimeToken({
            token,
            publicKeyPem: input.platformPublicKeyPem,
            expectedWorkspaceId: input.binding.workspaceId,
            expectedSessionId: input.binding.sessionId,
            expectedVirtualAccountId: input.binding.virtualAccountId,
          });

          if (
            typeof rawBody.virtualRegion !== "string" ||
            typeof rawBody.serviceCode !== "string" ||
            typeof rawBody.operation !== "string" ||
            typeof rawBody.correlationId !== "string"
          ) {
            json(response, 400, { error: { code: "INVALID_REQUEST" } });
            return;
          }

          body = {
            workspaceId: input.binding.workspaceId,
            sessionId: input.binding.sessionId,
            virtualAccountId: input.binding.virtualAccountId,
            virtualRegion: rawBody.virtualRegion,
            serviceCode: rawBody.serviceCode,
            operation: rawBody.operation,
            ...(rawBody.payload === undefined ? {} : { payload: rawBody.payload }),
            accessKeyId: input.binding.credential.accessKeyId,
            secretAccessKey: input.binding.credential.secretAccessKey,
            correlationId: rawBody.correlationId,
          };
        } else {
          body = rawBody as LabGatewayRequest;
        }

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
      } finally {
        invocationFinished();
      }
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
        error.message.startsWith("INVALID_RUNTIME_TOKEN")
      ) {
        json(response, 401, {
          error: {
            code: "INVALID_PLATFORM_TOKEN",
          },
        });
        return;
      }

      if (
        error instanceof Error &&
        error.message === "RUNTIME_TOKEN_EXPIRED"
      ) {
        json(response, 401, {
          error: {
            code: "PLATFORM_TOKEN_EXPIRED",
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
