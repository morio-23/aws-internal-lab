import postgres from "postgres";

import { uuidv7 } from "../../domain/src/id.js";
import type { VirtualRegion } from "../../aws-virtual/src/index.js";

export type ActiveRuntimeRecord = {
  workspaceId: string;
  sessionId: string;
  runtimeId: string;
  runtimeType: "standard" | "advanced";
  sessionStatus: string;
  runtimeStatus: string;
  providerRef: string | null;
  privateEndpoint: string | null;
  stateVolumeRef: string | null;
  virtualAccountId: string;
  enabledRegions: readonly VirtualRegion[];
};

type ActiveRuntimeRow = {
  workspace_id: string;
  session_id: string;
  runtime_id: string;
  runtime_type: "standard" | "advanced";
  session_status: string;
  runtime_status: string;
  provider_ref: string | null;
  private_endpoint: string | null;
  state_volume_ref: string | null;
  virtual_account_id: string;
  enabled_regions: VirtualRegion[] | string;
};

function mapRuntime(row: ActiveRuntimeRow): ActiveRuntimeRecord {
  const enabledRegions =
    typeof row.enabled_regions === "string"
      ? (JSON.parse(row.enabled_regions) as VirtualRegion[])
      : row.enabled_regions;
  return {
    workspaceId: row.workspace_id,
    sessionId: row.session_id,
    runtimeId: row.runtime_id,
    runtimeType: row.runtime_type,
    sessionStatus: row.session_status,
    runtimeStatus: row.runtime_status,
    providerRef: row.provider_ref,
    privateEndpoint: row.private_endpoint,
    stateVolumeRef: row.state_volume_ref,
    virtualAccountId: row.virtual_account_id,
    enabledRegions,
  };
}

export async function createStartingStandardRuntime(input: {
  databaseUrl: string;
  workspaceId: string;
}): Promise<ActiveRuntimeRecord> {
  const sql = postgres(input.databaseUrl, { max: 1 });
  try {
    return await sql.begin(async (tx) => {
      const workspaceRows = await tx<{
        virtual_account_id: string;
        enabled_regions: VirtualRegion[] | string;
        active_session_id: string | null;
      }[]>`
        SELECT virtual_account_id, enabled_regions, active_session_id
        FROM lab_workspace
        WHERE id = ${input.workspaceId}
          AND deleted_at IS NULL
        FOR UPDATE
      `;
      const workspace = workspaceRows[0];
      if (!workspace) throw new Error("WORKSPACE_NOT_FOUND");
      if (workspace.active_session_id) throw new Error("WORKSPACE_ALREADY_ACTIVE");

      const sessionId = uuidv7();
      const runtimeId = uuidv7();

      await tx`
        INSERT INTO lab_session (id, workspace_id, status, runtime_type, started_at)
        VALUES (${sessionId}, ${input.workspaceId}, 'starting', 'standard', now())
      `;
      await tx`
        INSERT INTO lab_runtime (id, session_id, runtime_type, status)
        VALUES (${runtimeId}, ${sessionId}, 'standard', 'starting')
      `;
      await tx`
        UPDATE lab_workspace
        SET active_session_id = ${sessionId}, status = 'starting', updated_at = now()
        WHERE id = ${input.workspaceId}
      `;

      return {
        workspaceId: input.workspaceId,
        sessionId,
        runtimeId,
        runtimeType: "standard",
        sessionStatus: "starting",
        runtimeStatus: "starting",
        providerRef: null,
        privateEndpoint: null,
        stateVolumeRef: null,
        virtualAccountId: workspace.virtual_account_id,
        enabledRegions:
          typeof workspace.enabled_regions === "string"
            ? (JSON.parse(workspace.enabled_regions) as VirtualRegion[])
            : workspace.enabled_regions,
      };
    });
  } finally {
    await sql.end();
  }
}

export async function markStandardRuntimeReady(input: {
  databaseUrl: string;
  runtimeId: string;
  providerRef: string;
  privateEndpoint?: string;
  stateVolumeRef?: string;
}): Promise<void> {
  const sql = postgres(input.databaseUrl, { max: 1 });
  try {
    await sql.begin(async (tx) => {
      const rows = await tx<{ session_id: string; workspace_id: string }[]>`
        UPDATE lab_runtime r
        SET provider_ref = ${input.providerRef},
            private_endpoint = ${input.privateEndpoint ?? null},
            state_volume_ref = ${input.stateVolumeRef ?? null},
            status = 'ready',
            heartbeat_at = now()
        FROM lab_session s
        WHERE r.id = ${input.runtimeId}
          AND s.id = r.session_id
        RETURNING r.session_id, s.workspace_id
      `;
      const row = rows[0];
      if (!row) throw new Error("RUNTIME_NOT_FOUND");
      await tx`UPDATE lab_session SET status = 'ready' WHERE id = ${row.session_id}`;
      await tx`UPDATE lab_workspace SET status = 'ready', updated_at = now() WHERE id = ${row.workspace_id}`;
    });
  } finally {
    await sql.end();
  }
}

export async function getActiveRuntimeForWorkspace(input: {
  databaseUrl: string;
  workspaceId: string;
}): Promise<ActiveRuntimeRecord | null> {
  const sql = postgres(input.databaseUrl, { max: 1 });
  try {
    const rows = await sql<ActiveRuntimeRow[]>`
      SELECT
        w.id AS workspace_id,
        s.id AS session_id,
        r.id AS runtime_id,
        r.runtime_type,
        s.status AS session_status,
        r.status AS runtime_status,
        r.provider_ref,
        r.private_endpoint,
        r.state_volume_ref,
        w.virtual_account_id,
        w.enabled_regions
      FROM lab_workspace w
      JOIN lab_session s ON s.id = w.active_session_id
      JOIN lab_runtime r ON r.session_id = s.id
      WHERE w.id = ${input.workspaceId}
        AND w.deleted_at IS NULL
        AND r.deleted_at IS NULL
      LIMIT 1
    `;
    return rows[0] ? mapRuntime(rows[0]) : null;
  } finally {
    await sql.end();
  }
}

export async function markRuntimeHeartbeat(input: {
  databaseUrl: string;
  runtimeId: string;
  privateEndpoint?: string;
}): Promise<void> {
  const sql = postgres(input.databaseUrl, { max: 1 });
  try {
    await sql`
      UPDATE lab_runtime
      SET heartbeat_at = now(),
          private_endpoint = COALESCE(${input.privateEndpoint ?? null}, private_endpoint)
      WHERE id = ${input.runtimeId}
        AND deleted_at IS NULL
    `;
  } finally {
    await sql.end();
  }
}

export async function finishStandardRuntime(input: {
  databaseUrl: string;
  workspaceId: string;
  runtimeId: string;
  finalStatus: "stopped" | "failed";
}): Promise<void> {
  const sql = postgres(input.databaseUrl, { max: 1 });
  try {
    await sql.begin(async (tx) => {
      const runtimeRows = await tx<{ session_id: string }[]>`
        UPDATE lab_runtime
        SET status = ${input.finalStatus}, deleted_at = now()
        WHERE id = ${input.runtimeId}
        RETURNING session_id
      `;
      const runtime = runtimeRows[0];
      if (!runtime) return;
      await tx`
        UPDATE lab_session
        SET status = ${input.finalStatus}, ended_at = now()
        WHERE id = ${runtime.session_id}
      `;
      await tx`
        UPDATE lab_workspace
        SET active_session_id = NULL,
            status = ${input.finalStatus === "stopped" ? "inactive" : "failed"},
            updated_at = now()
        WHERE id = ${input.workspaceId}
          AND active_session_id = ${runtime.session_id}
      `;
    });
  } finally {
    await sql.end();
  }
}

export async function listActiveStandardRuntimes(input: {
  databaseUrl: string;
}): Promise<ActiveRuntimeRecord[]> {
  const sql = postgres(input.databaseUrl, { max: 1 });
  try {
    const rows = await sql<ActiveRuntimeRow[]>`
      SELECT
        w.id AS workspace_id,
        s.id AS session_id,
        r.id AS runtime_id,
        r.runtime_type,
        s.status AS session_status,
        r.status AS runtime_status,
        r.provider_ref,
        r.private_endpoint,
        r.state_volume_ref,
        w.virtual_account_id,
        w.enabled_regions
      FROM lab_workspace w
      JOIN lab_session s ON s.id = w.active_session_id
      JOIN lab_runtime r ON r.session_id = s.id
      WHERE r.runtime_type = 'standard'
        AND r.deleted_at IS NULL
    `;
    return rows.map(mapRuntime);
  } finally {
    await sql.end();
  }
}
