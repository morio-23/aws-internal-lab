import postgres from "postgres";

import type { UserIdentity } from "../../domain/src/auth.js";
import { uuidv7 } from "../../domain/src/id.js";
import {
  DEFAULT_VIRTUAL_REGION,
  SUPPORTED_VIRTUAL_REGIONS,
  assertVirtualRegion,
  generateVirtualAccountId,
  type VirtualRegion,
} from "../../aws-virtual/src/index.js";

export type LabWorkspaceRecord = {
  id: string;
  ownerUserId: string;
  virtualAccountId: string;
  partition: "aws";
  primaryVirtualRegion: VirtualRegion;
  enabledRegions: readonly VirtualRegion[];
  status: string;
  standardEligible: boolean;
  lifecycleVersion: number;
};

type WorkspaceRow = {
  id: string;
  owner_user_id: string;
  virtual_account_id: string;
  partition_name: "aws";
  primary_virtual_region: VirtualRegion;
  enabled_regions: VirtualRegion[] | string;
  status: string;
  standard_eligible: boolean;
  lifecycle_version: string | number;
};

function mapWorkspace(row: WorkspaceRow): LabWorkspaceRecord {
  const enabledRegions =
    typeof row.enabled_regions === "string"
      ? (JSON.parse(row.enabled_regions) as VirtualRegion[])
      : row.enabled_regions;

  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    virtualAccountId: row.virtual_account_id,
    partition: row.partition_name,
    primaryVirtualRegion: row.primary_virtual_region,
    enabledRegions,
    status: row.status,
    standardEligible: row.standard_eligible,
    lifecycleVersion: Number(row.lifecycle_version),
  };
}

async function ensureUser(
  sql: ReturnType<typeof postgres>,
  identity: UserIdentity,
): Promise<string> {
  const userId = uuidv7();
  const displayName = identity.displayName ?? null;

  const rows = await sql<{ id: string }[]>`
    INSERT INTO app_user (id, external_subject, display_name)
    VALUES (${userId}, ${identity.subject}, ${displayName})
    ON CONFLICT (external_subject)
    DO UPDATE SET
      display_name = EXCLUDED.display_name,
      updated_at = now()
    RETURNING id
  `;

  const row = rows[0];
  if (!row) throw new Error("failed to resolve platform user");

  for (const role of identity.roles) {
    await sql`
      INSERT INTO role_assignment (id, user_id, role)
      VALUES (${uuidv7()}, ${row.id}, ${role})
      ON CONFLICT (user_id, role) DO NOTHING
    `;
  }

  return row.id;
}

export async function createWorkspace(input: {
  databaseUrl: string;
  identity: UserIdentity;
  primaryVirtualRegion?: string;
}): Promise<LabWorkspaceRecord> {
  const region = input.primaryVirtualRegion ?? DEFAULT_VIRTUAL_REGION;
  assertVirtualRegion(region);

  const sql = postgres(input.databaseUrl, { max: 1 });

  try {
    const ownerUserId = await ensureUser(sql, input.identity);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const workspaceId = uuidv7();
      const virtualAccountId = generateVirtualAccountId();

      try {
        const rows = await sql<WorkspaceRow[]>`
          INSERT INTO lab_workspace (
            id,
            owner_user_id,
            virtual_account_id,
            primary_virtual_region,
            enabled_regions
          )
          VALUES (
            ${workspaceId},
            ${ownerUserId},
            ${virtualAccountId},
            ${region},
            ${JSON.stringify(SUPPORTED_VIRTUAL_REGIONS)}::jsonb
          )
          RETURNING *
        `;

        const row = rows[0];
        if (!row) throw new Error("workspace insert returned no row");
        return mapWorkspace(row);
      } catch (error) {
        const code =
          typeof error === "object" && error !== null && "code" in error
            ? String(error.code)
            : undefined;

        if (code === "23505" && attempt < 2) continue;
        throw error;
      }
    }

    throw new Error("failed to allocate a unique virtual account ID");
  } finally {
    await sql.end();
  }
}

export async function listWorkspacesForOwner(input: {
  databaseUrl: string;
  ownerSubject: string;
}): Promise<LabWorkspaceRecord[]> {
  const sql = postgres(input.databaseUrl, { max: 1 });

  try {
    const rows = await sql<WorkspaceRow[]>`
      SELECT w.*
      FROM lab_workspace w
      JOIN app_user u ON u.id = w.owner_user_id
      WHERE u.external_subject = ${input.ownerSubject}
        AND w.deleted_at IS NULL
      ORDER BY w.created_at
    `;

    return rows.map(mapWorkspace);
  } finally {
    await sql.end();
  }
}

export async function getWorkspaceForOwner(input: {
  databaseUrl: string;
  workspaceId: string;
  ownerSubject: string;
}): Promise<LabWorkspaceRecord | null> {
  const sql = postgres(input.databaseUrl, { max: 1 });

  try {
    const rows = await sql<WorkspaceRow[]>`
      SELECT w.*
      FROM lab_workspace w
      JOIN app_user u ON u.id = w.owner_user_id
      WHERE w.id = ${input.workspaceId}
        AND u.external_subject = ${input.ownerSubject}
        AND w.deleted_at IS NULL
      LIMIT 1
    `;

    return rows[0] ? mapWorkspace(rows[0]) : null;
  } finally {
    await sql.end();
  }
}
