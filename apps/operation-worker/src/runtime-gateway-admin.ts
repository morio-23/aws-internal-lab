import { signRuntimeToken } from "../../../packages/runtime-auth/src/index.js";

export type RuntimeGatewayIdentity = {
  endpoint: string;
  workspaceId: string;
  sessionId: string;
  virtualAccountId: string;
};

export interface RuntimeGatewayAdmin {
  quiesce(identity: RuntimeGatewayIdentity): Promise<void>;
  unquiesce(identity: RuntimeGatewayIdentity): Promise<void>;
}

function gatewayUrl(endpoint: string, path: string): string {
  if (!/^10\.30\.(?:[0-9]{1,3})\.(?:[0-9]{1,3}):8080$/.test(endpoint)) {
    throw new Error("INVALID_RUNTIME_GATEWAY_ENDPOINT");
  }
  return "http://" + endpoint + path;
}

export class HttpRuntimeGatewayAdmin implements RuntimeGatewayAdmin {
  readonly #privateKeyPem: string;
  readonly #fetch: typeof fetch;

  constructor(input: {
    privateKeyPem: string;
    fetchImpl?: typeof fetch;
  }) {
    this.#privateKeyPem = input.privateKeyPem;
    this.#fetch = input.fetchImpl ?? fetch;
  }

  async #post(
    path: "/admin/quiesce" | "/admin/unquiesce",
    identity: RuntimeGatewayIdentity,
  ): Promise<void> {
    const token = signRuntimeToken({
      privateKeyPem: this.#privateKeyPem,
      workspaceId: identity.workspaceId,
      sessionId: identity.sessionId,
      virtualAccountId: identity.virtualAccountId,
      ttlSeconds: 60,
    });

    const response = await this.#fetch(gatewayUrl(identity.endpoint, path), {
      method: "POST",
      headers: {
        authorization: "Bearer " + token,
      },
    });

    if (!response.ok) {
      throw new Error(
        "RUNTIME_GATEWAY_ADMIN_FAILED:" + path + ":" + response.status,
      );
    }
  }

  async quiesce(identity: RuntimeGatewayIdentity): Promise<void> {
    await this.#post("/admin/quiesce", identity);
  }

  async unquiesce(identity: RuntimeGatewayIdentity): Promise<void> {
    await this.#post("/admin/unquiesce", identity);
  }
}
