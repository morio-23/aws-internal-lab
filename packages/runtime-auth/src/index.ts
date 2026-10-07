import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
} from "node:crypto";

export type RuntimeTokenClaims = {
  workspaceId: string;
  sessionId: string;
  virtualAccountId: string;
  audience: "lab-gateway";
  issuedAt: number;
  expiresAt: number;
};

function encode(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

function decode(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

export function generateRuntimeTokenKeyPair(): {
  privateKeyPem: string;
  publicKeyPem: string;
} {
  const pair = generateKeyPairSync("ed25519");
  return {
    privateKeyPem: pair.privateKey.export({
      type: "pkcs8",
      format: "pem",
    }).toString(),
    publicKeyPem: pair.publicKey.export({
      type: "spki",
      format: "pem",
    }).toString(),
  };
}

export function signRuntimeToken(input: {
  privateKeyPem: string;
  workspaceId: string;
  sessionId: string;
  virtualAccountId: string;
  now?: Date;
  ttlSeconds?: number;
}): string {
  const nowSeconds = Math.floor((input.now?.getTime() ?? Date.now()) / 1000);
  const claims: RuntimeTokenClaims = {
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    virtualAccountId: input.virtualAccountId,
    audience: "lab-gateway",
    issuedAt: nowSeconds,
    expiresAt: nowSeconds + (input.ttlSeconds ?? 60),
  };
  const body = encode(JSON.stringify(claims));
  const signature = sign(
    null,
    Buffer.from(body),
    createPrivateKey(input.privateKeyPem),
  );
  return body + "." + encode(signature);
}

export function verifyRuntimeToken(input: {
  token: string;
  publicKeyPem: string;
  expectedWorkspaceId: string;
  expectedSessionId: string;
  expectedVirtualAccountId: string;
  now?: Date;
}): RuntimeTokenClaims {
  const [body, signature, extra] = input.token.split(".");
  if (!body || !signature || extra) {
    throw new Error("INVALID_RUNTIME_TOKEN");
  }

  const valid = verify(
    null,
    Buffer.from(body),
    createPublicKey(input.publicKeyPem),
    decode(signature),
  );
  if (!valid) throw new Error("INVALID_RUNTIME_TOKEN_SIGNATURE");

  let claims: RuntimeTokenClaims;
  try {
    claims = JSON.parse(decode(body).toString("utf8")) as RuntimeTokenClaims;
  } catch {
    throw new Error("INVALID_RUNTIME_TOKEN");
  }

  const nowSeconds = Math.floor((input.now?.getTime() ?? Date.now()) / 1000);
  if (claims.audience !== "lab-gateway") {
    throw new Error("INVALID_RUNTIME_TOKEN_AUDIENCE");
  }
  if (claims.expiresAt <= nowSeconds || claims.issuedAt > nowSeconds + 30) {
    throw new Error("RUNTIME_TOKEN_EXPIRED");
  }
  if (claims.workspaceId !== input.expectedWorkspaceId) {
    throw new Error("INVALID_RUNTIME_TOKEN_WORKSPACE");
  }
  if (claims.sessionId !== input.expectedSessionId) {
    throw new Error("INVALID_RUNTIME_TOKEN_SESSION");
  }
  if (claims.virtualAccountId !== input.expectedVirtualAccountId) {
    throw new Error("INVALID_RUNTIME_TOKEN_ACCOUNT");
  }

  return claims;
}
