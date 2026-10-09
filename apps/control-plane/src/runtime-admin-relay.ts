import { verifyRuntimeToken } from "../../../packages/runtime-auth/src/index.js";

export type RuntimeAdminIdentity = {
  endpoint: string;
  workspaceId: string;
  sessionId: string;
  virtualAccountId: string;
};

export async function relayRuntimeAdmin(input: {
  action: "quiesce" | "persist" | "unquiesce";
  identity: RuntimeAdminIdentity;
  authorization: string | undefined;
  publicKeyPem: string;
  resolveRuntime: (workspaceId: string) => Promise<{
    sessionId: string;
    virtualAccountId: string;
    privateEndpoint: string | null;
  } | null>;
  fetchImpl?: typeof fetch;
}): Promise<number> {
  const { identity } = input;
  if (
    typeof identity?.workspaceId !== "string" ||
    typeof identity.sessionId !== "string" ||
    typeof identity.virtualAccountId !== "string" ||
    typeof identity.endpoint !== "string" ||
    !/^10\.30\.(?:[0-9]{1,3})\.(?:[0-9]{1,3}):8080$/.test(identity.endpoint)
  ) {
    return 400;
  }
  if (!input.authorization?.startsWith("Bearer ")) return 401;
  try {
    verifyRuntimeToken({
      token: input.authorization.slice("Bearer ".length),
      publicKeyPem: input.publicKeyPem,
      expectedWorkspaceId: identity.workspaceId,
      expectedSessionId: identity.sessionId,
      expectedVirtualAccountId: identity.virtualAccountId,
    });
  } catch {
    return 401;
  }
  const runtime = await input.resolveRuntime(identity.workspaceId);
  if (
    !runtime ||
    runtime.sessionId !== identity.sessionId ||
    runtime.virtualAccountId !== identity.virtualAccountId ||
    runtime.privateEndpoint !== identity.endpoint
  ) {
    return 409;
  }
  const gatewayResponse = await (input.fetchImpl ?? fetch)(
    `http://${identity.endpoint}/admin/${input.action}`,
    {
      method: "POST",
      headers: { authorization: input.authorization },
      signal: AbortSignal.timeout(120_000),
    },
  );
  return gatewayResponse.status;
}
