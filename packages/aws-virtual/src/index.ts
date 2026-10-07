export const packageName = "@aws-internal-lab/aws-virtual";

import { randomInt } from "node:crypto";

export const SUPPORTED_VIRTUAL_REGIONS = [
  "ap-northeast-1",
  "ap-northeast-3",
] as const;

export type VirtualRegion = (typeof SUPPORTED_VIRTUAL_REGIONS)[number];

export const DEFAULT_VIRTUAL_REGION: VirtualRegion = "ap-northeast-1";

export function isVirtualRegion(value: string): value is VirtualRegion {
  return (SUPPORTED_VIRTUAL_REGIONS as readonly string[]).includes(value);
}

export function assertVirtualRegion(value: string): asserts value is VirtualRegion {
  if (!isVirtualRegion(value)) {
    throw new Error(`Unsupported virtual region: ${value}`);
  }
}

export function generateVirtualAccountId(): string {
  return randomInt(0, 1_000_000_000_000).toString().padStart(12, "0");
}

export function isVirtualAccountId(value: string): boolean {
  return /^\d{12}$/.test(value);
}

export type ArnParts = {
  service: string;
  resource: string;
  region?: string;
  accountId?: string;
  partition?: "aws";
};

export function buildArn({
  service,
  resource,
  region = "",
  accountId = "",
  partition = "aws",
}: ArnParts): string {
  return `arn:${partition}:${service}:${region}:${accountId}:${resource}`;
}

export function regionalArn(input: {
  service: string;
  region: VirtualRegion;
  accountId: string;
  resource: string;
}): string {
  if (!isVirtualAccountId(input.accountId)) {
    throw new Error("virtual account ID must be a 12 digit number");
  }

  return buildArn({
    service: input.service,
    region: input.region,
    accountId: input.accountId,
    resource: input.resource,
  });
}

export function s3BucketArn(bucketName: string): string {
  return buildArn({
    service: "s3",
    resource: bucketName,
  });
}

export function iamRoleArn(accountId: string, roleName: string): string {
  if (!isVirtualAccountId(accountId)) {
    throw new Error("virtual account ID must be a 12 digit number");
  }

  return buildArn({
    service: "iam",
    accountId,
    resource: `role/${roleName}`,
  });
}

export function route53HostedZoneArn(hostedZoneId: string): string {
  return buildArn({
    service: "route53",
    resource: `hostedzone/${hostedZoneId}`,
  });
}
