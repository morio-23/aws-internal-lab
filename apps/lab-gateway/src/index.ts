import { randomBytes, timingSafeEqual } from "node:crypto";

import {
  assertVirtualRegion,
  isVirtualAccountId,
  type VirtualRegion,
} from "../../../packages/aws-virtual/src/index.js";
import {
  prototypeCapabilityRegistry,
  type CapabilityRegistry,
  type OperationCapability,
  type ProviderKind,
} from "../../../packages/service-capabilities/src/index.js";

export const appName = "lab-gateway";

export type LabCredential = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionId: string;
};

export type LabBinding = {
  workspaceId: string;
  sessionId: string;
  virtualAccountId: string;
  enabledRegions: readonly VirtualRegion[];
  credential: LabCredential;
};

export type LabGatewayRequest = {
  workspaceId: string;
  sessionId: string;
  virtualAccountId: string;
  virtualRegion: string;
  serviceCode: string;
  operation: string;
  payload?: unknown;
  accessKeyId: string;
  secretAccessKey: string;
  correlationId: string;
};

export type GatewayRoute = {
  provider: Exclude<ProviderKind, "deny">;
  capability: OperationCapability;
  correlationId: string;
};

export type GatewayErrorCode =
  | "INVALID_WORKSPACE"
  | "INVALID_SESSION"
  | "INVALID_ACCOUNT"
  | "INVALID_REGION"
  | "INVALID_CREDENTIAL"
  | "REAL_AWS_CREDENTIAL_REJECTED"
  | "OPERATION_DISABLED"
  | "OPERATION_DENIED"
  | "OPERATION_UNSUPPORTED";

export class LabGatewayError extends Error {
  readonly code: GatewayErrorCode;

  constructor(code: GatewayErrorCode) {
    super(code);
    this.code = code;
  }
}

const REAL_AWS_KEY_PREFIX = /^(AKIA|ASIA)/;

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function looksLikeRealAwsAccessKey(accessKeyId: string): boolean {
  return REAL_AWS_KEY_PREFIX.test(accessKeyId);
}

export function createLabCredential(input: {
  virtualAccountId: string;
  sessionId: string;
}): LabCredential {
  if (!isVirtualAccountId(input.virtualAccountId)) {
    throw new Error("virtual account ID must be a 12 digit number");
  }

  return {
    accessKeyId: input.virtualAccountId,
    secretAccessKey: randomBytes(32).toString("base64url"),
    sessionId: input.sessionId,
  };
}

export function validateLabCredential(input: {
  binding: LabBinding;
  accessKeyId: string;
  secretAccessKey: string;
}): void {
  if (looksLikeRealAwsAccessKey(input.accessKeyId)) {
    throw new LabGatewayError("REAL_AWS_CREDENTIAL_REJECTED");
  }

  if (
    input.accessKeyId !== input.binding.credential.accessKeyId ||
    !safeEqual(input.secretAccessKey, input.binding.credential.secretAccessKey)
  ) {
    throw new LabGatewayError("INVALID_CREDENTIAL");
  }
}

export function routeLabRequest(input: {
  binding: LabBinding;
  request: LabGatewayRequest;
  registry?: CapabilityRegistry;
}): GatewayRoute {
  const { binding, request } = input;
  const registry = input.registry ?? prototypeCapabilityRegistry;

  if (request.workspaceId !== binding.workspaceId) {
    throw new LabGatewayError("INVALID_WORKSPACE");
  }

  if (
    request.sessionId !== binding.sessionId ||
    request.sessionId !== binding.credential.sessionId
  ) {
    throw new LabGatewayError("INVALID_SESSION");
  }

  if (
    request.virtualAccountId !== binding.virtualAccountId ||
    request.virtualAccountId !== binding.credential.accessKeyId
  ) {
    throw new LabGatewayError("INVALID_ACCOUNT");
  }

  assertVirtualRegion(request.virtualRegion);
  if (
    !binding.enabledRegions.includes(request.virtualRegion as VirtualRegion)
  ) {
    throw new LabGatewayError("INVALID_REGION");
  }

  validateLabCredential({
    binding,
    accessKeyId: request.accessKeyId,
    secretAccessKey: request.secretAccessKey,
  });

  const capability = registry.resolve(request.serviceCode, request.operation);
  if (!capability) {
    throw new LabGatewayError("OPERATION_UNSUPPORTED");
  }
  if (!capability.enabled) {
    throw new LabGatewayError("OPERATION_DISABLED");
  }
  if (capability.provider === "deny") {
    throw new LabGatewayError("OPERATION_DENIED");
  }

  return {
    provider: capability.provider,
    capability,
    correlationId: request.correlationId,
  };
}

export type ProviderInvocation = {
  binding: LabBinding;
  request: LabGatewayRequest;
  route: GatewayRoute;
};

export interface ProviderAdapter {
  readonly kind: Exclude<ProviderKind, "deny">;
  invoke(input: ProviderInvocation): Promise<unknown>;
}

export interface IntegrationBridge {
  deliver(input: {
    workspaceId: string;
    sourceArn: string;
    targetArn: string;
    action: string;
    payload: unknown;
    correlationId: string;
  }): Promise<void>;
}

export async function dispatchLabRequest(input: {
  binding: LabBinding;
  request: LabGatewayRequest;
  registry?: CapabilityRegistry;
  providers: readonly ProviderAdapter[];
}): Promise<unknown> {
  const route = routeLabRequest(input);
  const provider = input.providers.find((item) => item.kind === route.provider);

  if (!provider) {
    throw new LabGatewayError("OPERATION_UNSUPPORTED");
  }

  return provider.invoke({
    binding: input.binding,
    request: input.request,
    route,
  });
}
