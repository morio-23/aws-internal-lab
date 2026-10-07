import postgres from "postgres";

import { uuidv7 } from "../../domain/src/id.js";

export type LabSnapshotRecord = {
  id: string;
  workspaceId: string;
  sourceSessionId: string | null;
  status:
    | "creating"
    | "available"
    | "restoring"
    | "expired"
    | "deleting"
    | "deleted"
    | "failed"
    | "quarantined";
  runtimeType: "standard" | "advanced";
  payloadType: string;
  providerSnapshotRef: string | null;
  manifestKey: string | null;
  consistencyLevel:
    | "application-consistent"
    | "configuration-consistent"
    | "crash-consistent";
  snapshotFormatVersion: number;
  expiresAt: Date;
};

type SnapshotRow = {
  id: string;
  workspace_id: string;
  source_session_id: string | null;
  status: LabSnapshotRecord["status"];
  runtime_type: LabSnapshotRecord["runtimeType"];
  payload_type: string;
  provider_snapshot_ref: string | null;
  manifest_key: string | null;
  consistency_level: LabSnapshotRecord["consistencyLevel"];
  snapshot_format_version: number;
  expires_at: Date | string;
};

function mapSnapshot(row: SnapshotRow): LabSnapshotRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    sourceSessionId: row.source_session_id,
    status: row.status,
    runtimeType: row.runtime_type,
    payloadType: row.payload_type,
    providerSnapshotRef: row.provider_snapshot_ref,
    manifestKey: row.manifest_key,
    consistencyLevel: row.consistency_level,
    snapshotFormatVersion: row.snapshot_format_version,
    expiresAt:
      row.expires_at instanceof Date ? row.expires_at : new Date(row.expires_at),
  };
}

export async function createStandardSnapshotRecord(input: {
  databaseUrl: string;
  workspaceId: string;
  sourceSessionId: string;
  retentionDays?: number;
}): Promise<LabSnapshotRecord> {
  const sql = postgres(input.databaseUrl, { max: 1 });
  try {
    const id = uuidv7();
    const retentionDays = input.retentionDays ?? 7;
    const rows = await sql<SnapshotRow[]>`
      INSERT INTO lab_snapshot (
        id,
        workspace_id,
        source_session_id,
        status,
        runtime_type,
        payload_type,
        consistency_level,
        expires_at
      )
      VALUES (
        ${id},
        ${input.workspaceId},
        ${input.sourceSessionId},
        'creating',
        'standard',
        'ebs-snapshot',
        'application-consistent',
        now() + (${retentionDays} * interval '1 day')
      )
      RETURNING *
    `;
    const row = rows[0];
    if (!row) throw new Error("SNAPSHOT_INSERT_FAILED");
    return mapSnapshot(row);
  } finally {
    await sql.end();
  }
}

export async function markStandardSnapshotAvailable(input: {
  databaseUrl: string;
  snapshotId: string;
  providerSnapshotRef: string;
  manifestKey: string;
}): Promise<void> {
  const sql = postgres(input.databaseUrl, { max: 1 });
  try {
    await sql.begin(async (tx) => {
      const rows = await tx<{ workspace_id: string }[]>`
        UPDATE lab_snapshot
        SET
          status = 'available',
          provider_snapshot_ref = ${input.providerSnapshotRef},
          manifest_key = ${input.manifestKey},
          error_code = NULL
        WHERE id = ${input.snapshotId}
          AND status = 'creating'
        RETURNING workspace_id
      `;
      const row = rows[0];
      if (!row) throw new Error("SNAPSHOT_NOT_CREATING");

      await tx`
        UPDATE lab_workspace
        SET
          current_snapshot_id = ${input.snapshotId},
          status = 'suspended',
          updated_at = now()
        WHERE id = ${row.workspace_id}
      `;
    });
  } finally {
    await sql.end();
  }
}

export async function markSnapshotFailed(input: {
  databaseUrl: string;
  snapshotId: string;
  errorCode: string;
}): Promise<void> {
  const sql = postgres(input.databaseUrl, { max: 1 });
  try {
    await sql`
      UPDATE lab_snapshot
      SET status = 'failed', error_code = ${input.errorCode}
      WHERE id = ${input.snapshotId}
        AND status = 'creating'
    `;
  } finally {
    await sql.end();
  }
}

export async function getAvailableSnapshotForWorkspace(input: {
  databaseUrl: string;
  workspaceId: string;
  snapshotId?: string;
}): Promise<LabSnapshotRecord | null> {
  const sql = postgres(input.databaseUrl, { max: 1 });
  try {
    const rows = await sql<SnapshotRow[]>`
      SELECT *
      FROM lab_snapshot
      WHERE workspace_id = ${input.workspaceId}
        AND status = 'available'
        AND deleted_at IS NULL
        ${input.snapshotId ? sql`AND id = ${input.snapshotId}` : sql``}
      ORDER BY created_at DESC
      LIMIT 1
    `;
    return rows[0] ? mapSnapshot(rows[0]) : null;
  } finally {
    await sql.end();
  }
}

export async function markSnapshotRestored(input: {
  databaseUrl: string;
  snapshotId: string;
}): Promise<void> {
  const sql = postgres(input.databaseUrl, { max: 1 });
  try {
    await sql`
      UPDATE lab_snapshot
      SET last_restored_at = now()
      WHERE id = ${input.snapshotId}
        AND status = 'available'
    `;
  } finally {
    await sql.end();
  }
}
