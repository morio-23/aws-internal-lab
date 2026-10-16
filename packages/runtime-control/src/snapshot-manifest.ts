import { createHash } from "node:crypto";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { isVirtualRegion } from "../../aws-virtual/src/index.js";

export type StandardSnapshotManifest = {
  snapshotFormatVersion: 1;
  runtimeType: "standard";
  payloadType: "ebs-snapshot";
  snapshotId: string;
  workspaceId: string;
  sourceSessionId: string;
  ebsSnapshotId: string;
  consistencyLevel: "application-consistent";
  virtualRegions: readonly string[];
  createdAt: string;
  engineVersion?: string;
  engineImageDigest?: string;
};

export interface SnapshotManifestStore {
  putManifest(
    manifest: StandardSnapshotManifest,
  ): Promise<{ key: string; sha256: string }>;
  getManifest(key: string): Promise<StandardSnapshotManifest>;
  deleteManifest(key: string): Promise<void>;
}

type S3Sender = {
  send(
    command: PutObjectCommand | GetObjectCommand | DeleteObjectCommand,
  ): Promise<unknown>;
};

export class S3SnapshotManifestStore implements SnapshotManifestStore {
  readonly #bucket: string;
  readonly #client: S3Sender;

  constructor(input: {
    bucket: string;
    client?: S3Sender;
    clientConfig?: S3ClientConfig;
  }) {
    this.#bucket = input.bucket;
    this.#client = input.client ?? new S3Client(input.clientConfig ?? {});
  }

  async putManifest(
    manifest: StandardSnapshotManifest,
  ): Promise<{ key: string; sha256: string }> {
    const body = JSON.stringify(manifest);
    const sha256 = createHash("sha256").update(body).digest("hex");
    const key =
      "snapshots/" +
      manifest.workspaceId +
      "/" +
      manifest.snapshotId +
      "/manifest.json";

    await this.#client.send(
      new PutObjectCommand({
        Bucket: this.#bucket,
        Key: key,
        Body: body,
        ContentType: "application/json",
        Metadata: { sha256 },
      }),
    );

    return { key, sha256 };
  }

  async getManifest(key: string): Promise<StandardSnapshotManifest> {
    const result = (await this.#client.send(
      new GetObjectCommand({
        Bucket: this.#bucket,
        Key: key,
      }),
    )) as {
      Body?: { transformToString(): Promise<string> };
      Metadata?: Record<string, string>;
    };

    if (!result.Body) throw new Error("SNAPSHOT_MANIFEST_MISSING");
    const body = await result.Body.transformToString();
    const expected = result.Metadata?.sha256;
    const actual = createHash("sha256").update(body).digest("hex");
    if (!expected) throw new Error("SNAPSHOT_MANIFEST_CHECKSUM_MISSING");
    if (expected !== actual) {
      throw new Error("SNAPSHOT_MANIFEST_CHECKSUM_MISMATCH");
    }

    let manifest: unknown;
    try {
      manifest = JSON.parse(body);
    } catch {
      throw new Error("SNAPSHOT_MANIFEST_INVALID");
    }
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
      throw new Error("SNAPSHOT_MANIFEST_INVALID");
    }
    const value = manifest as Record<string, unknown>;
    if (
      value.snapshotFormatVersion !== 1 ||
      value.runtimeType !== "standard" ||
      value.payloadType !== "ebs-snapshot" ||
      value.consistencyLevel !== "application-consistent" ||
      typeof value.snapshotId !== "string" || !value.snapshotId ||
      typeof value.workspaceId !== "string" || !value.workspaceId ||
      typeof value.sourceSessionId !== "string" || !value.sourceSessionId ||
      typeof value.ebsSnapshotId !== "string" || !/^snap-[a-zA-Z0-9]+$/.test(value.ebsSnapshotId) ||
      typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt)) ||
      !Array.isArray(value.virtualRegions) ||
      value.virtualRegions.length === 0 ||
      !value.virtualRegions.every((region) => typeof region === "string" && isVirtualRegion(region)) ||
      key !== `snapshots/${value.workspaceId}/${value.snapshotId}/manifest.json`
    ) {
      throw new Error("SNAPSHOT_MANIFEST_INVALID");
    }

    return value as StandardSnapshotManifest;
  }

  async deleteManifest(key: string): Promise<void> {
    await this.#client.send(
      new DeleteObjectCommand({
        Bucket: this.#bucket,
        Key: key,
      }),
    );
  }
}
