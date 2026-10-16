import { signRuntimeToken } from "../../../packages/runtime-auth/src/index.js";

export type RuntimeGatewayIdentity = {
  endpoint: string;
  workspaceId: string;
  sessionId: string;
  virtualAccountId: string;
};

export interface RuntimeGatewayAdmin {
  quiesce(identity: RuntimeGatewayIdentity): Promise<void>;
  persist(identity: RuntimeGatewayIdentity): Promise<void>;
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
  readonly #bffInternalUrl: string;
  readonly #fetch: typeof fetch;

  constructor(input: {
    privateKeyPem: string;
    bffInternalUrl: string;
    fetchImpl?: typeof fetch;
  }) {
    this.#privateKeyPem = input.privateKeyPem;
    const url = new URL(input.bffInternalUrl);
    if (!(["http:", "https:"].includes(url.protocol)) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      throw new Error("INVALID_BFF_INTERNAL_URL");
    }
    this.#bffInternalUrl = url.origin;
    this.#fetch = input.fetchImpl ?? fetch;
  }

  async #post(
    path: "/admin/quiesce" | "/admin/persist" | "/admin/unquiesce",
    identity: RuntimeGatewayIdentity,
  ): Promise<void> {
    const token = signRuntimeToken({
      privateKeyPem: this.#privateKeyPem,
      workspaceId: identity.workspaceId,
      sessionId: identity.sessionId,
      virtualAccountId: identity.virtualAccountId,
      ttlSeconds: 60,
    });

    gatewayUrl(identity.endpoint, path);
    const response = await this.#fetch(this.#bffInternalUrl + "/internal/runtime-admin" + path.slice("/admin".length), {
      method: "POST",
      headers: {
        authorization: "Bearer " + token,
        "content-type": "application/json",
      },
      body: JSON.stringify(identity),
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

  async persist(identity: RuntimeGatewayIdentity): Promise<void> {
    await this.#post("/admin/persist", identity);
  }

  async unquiesce(identity: RuntimeGatewayIdentity): Promise<void> {
    await this.#post("/admin/unquiesce", identity);
  }
}
