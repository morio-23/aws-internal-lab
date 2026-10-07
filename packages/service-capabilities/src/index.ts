export const packageName = "@aws-internal-lab/service-capabilities";

export const PROVIDER_KINDS = [
  "ministack",
  "internal",
  "reference",
  "deny",
] as const;

export type ProviderKind = (typeof PROVIDER_KINDS)[number];

export const RUNTIME_REQUIREMENTS = ["standard", "advanced"] as const;
export type RuntimeRequirement = (typeof RUNTIME_REQUIREMENTS)[number];

export type OperationCapability = {
  serviceCode: string;
  operation: string;
  provider: ProviderKind;
  runtimeRequirement: RuntimeRequirement;
  capacityProfile?: "small" | "medium" | "large";
  enabled: boolean;
  dangerous?: boolean;
  integrationOwner?: "ministack" | "internal";
};

export type CapabilityRegistry = {
  resolve(serviceCode: string, operation: string): OperationCapability | null;
  list(serviceCode?: string): readonly OperationCapability[];
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function createCapabilityRegistry(
  capabilities: readonly OperationCapability[],
): CapabilityRegistry {
  const exact = new Map<string, OperationCapability>();
  const wildcard = new Map<string, OperationCapability>();

  for (const capability of capabilities) {
    const serviceCode = normalize(capability.serviceCode);
    const operation = capability.operation.trim();
    const key = `${serviceCode}:${operation}`;

    if (operation === "*") wildcard.set(serviceCode, capability);
    else exact.set(key, capability);
  }

  return {
    resolve(serviceCode, operation) {
      const service = normalize(serviceCode);
      return (
        exact.get(`${service}:${operation.trim()}`) ??
        wildcard.get(service) ??
        null
      );
    },
    list(serviceCode) {
      if (!serviceCode) return [...capabilities];
      const normalized = normalize(serviceCode);
      return capabilities.filter(
        (capability) => normalize(capability.serviceCode) === normalized,
      );
    },
  };
}

export const prototypeCapabilityRegistry = createCapabilityRegistry([
  {
    serviceCode: "s3",
    operation: "CreateBucket",
    provider: "ministack",
    runtimeRequirement: "standard",
    enabled: true,
    integrationOwner: "ministack",
  },
  {
    serviceCode: "s3",
    operation: "ListBuckets",
    provider: "ministack",
    runtimeRequirement: "standard",
    enabled: true,
    integrationOwner: "ministack",
  },
  {
    serviceCode: "s3",
    operation: "PutObject",
    provider: "ministack",
    runtimeRequirement: "standard",
    enabled: true,
    integrationOwner: "ministack",
  },
  {
    serviceCode: "s3",
    operation: "GetObject",
    provider: "ministack",
    runtimeRequirement: "standard",
    enabled: true,
    integrationOwner: "ministack",
  },
  {
    serviceCode: "s3",
    operation: "DeleteObject",
    provider: "ministack",
    runtimeRequirement: "standard",
    enabled: true,
    integrationOwner: "ministack",
  },
  {
    serviceCode: "s3",
    operation: "DeleteBucket",
    provider: "ministack",
    runtimeRequirement: "standard",
    enabled: true,
    integrationOwner: "ministack",
  },
  {
    serviceCode: "dynamodb",
    operation: "CreateTable",
    provider: "ministack",
    runtimeRequirement: "standard",
    enabled: true,
    integrationOwner: "ministack",
  },
  {
    serviceCode: "dynamodb",
    operation: "ListTables",
    provider: "ministack",
    runtimeRequirement: "standard",
    enabled: true,
    integrationOwner: "ministack",
  },
  {
    serviceCode: "dynamodb",
    operation: "PutItem",
    provider: "ministack",
    runtimeRequirement: "standard",
    enabled: true,
    integrationOwner: "ministack",
  },
  {
    serviceCode: "dynamodb",
    operation: "GetItem",
    provider: "ministack",
    runtimeRequirement: "standard",
    enabled: true,
    integrationOwner: "ministack",
  },
  {
    serviceCode: "dynamodb",
    operation: "DeleteItem",
    provider: "ministack",
    runtimeRequirement: "standard",
    enabled: true,
    integrationOwner: "ministack",
  },
  {
    serviceCode: "dynamodb",
    operation: "DeleteTable",
    provider: "ministack",
    runtimeRequirement: "standard",
    enabled: true,
    integrationOwner: "ministack",
  },
  {
    serviceCode: "sqs",
    operation: "CreateQueue",
    provider: "ministack",
    runtimeRequirement: "standard",
    enabled: true,
    integrationOwner: "ministack",
  },
  {
    serviceCode: "sqs",
    operation: "ListQueues",
    provider: "ministack",
    runtimeRequirement: "standard",
    enabled: true,
    integrationOwner: "ministack",
  },
  {
    serviceCode: "sqs",
    operation: "SendMessage",
    provider: "ministack",
    runtimeRequirement: "standard",
    enabled: true,
    integrationOwner: "ministack",
  },
  {
    serviceCode: "sqs",
    operation: "ReceiveMessage",
    provider: "ministack",
    runtimeRequirement: "standard",
    enabled: true,
    integrationOwner: "ministack",
  },
  {
    serviceCode: "sqs",
    operation: "DeleteMessage",
    provider: "ministack",
    runtimeRequirement: "standard",
    enabled: true,
    integrationOwner: "ministack",
  },
  {
    serviceCode: "sqs",
    operation: "DeleteQueue",
    provider: "ministack",
    runtimeRequirement: "standard",
    enabled: true,
    integrationOwner: "ministack",
  },
  {
    serviceCode: "rds",
    operation: "*",
    provider: "ministack",
    runtimeRequirement: "advanced",
    capacityProfile: "medium",
    enabled: true,
    integrationOwner: "ministack",
  }
]);
