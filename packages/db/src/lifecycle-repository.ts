import postgres from "postgres";

import { uuidv7 } from "../../domain/src/id.js";
import type { LabOperationStatus } from "../../domain/src/lifecycle.js";

export type LabOperationRecord = {
  id: string;
  workspaceId: string;
  idempotencyKey: string;
  operationType: string;
  status: LabOperationStatus;
  requestedBy: string;
  correlationId: string;
  requestHash: string;
  attemptCount: number;
};

type OperationRow = {
  id: string;
  workspace_id: string;
  idempotency_key: string;
  operation_type: string;
  status: LabOperationStatus;
  requested_by: string;
  correlation_id: string;
  request_hash: string;
  attempt_count: number;
};

type OutboxRow = {
  id: string;
  aggregate_id: string;
  event_type: string;
  payload_json: unknown;
  retry_count: number;
};

function mapOperation(row: OperationRow): LabOperationRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    idempotencyKey: row.idempotency_key,
    operationType: row.operation_type,
    status: row.status,
    requestedBy: row.requested_by,
    correlationId: row.correlation_id,
    requestHash: row.request_hash,
    attemptCount: row.attempt_count,
  };
}

export async function createLifecycleOperation(input: {
  databaseUrl: string;
  workspaceId: string;
  idempotencyKey: string;
  operationType: string;
  requestedBy: string;
  correlationId: string;
  requestHash: string;
}): Promise<{ operation: LabOperationRecord; created: boolean }> {
  const sql = postgres(input.databaseUrl, { max: 1 });

  try {
    return await sql.begin(async (tx) => {
      const existing = await tx<OperationRow[]>`
        SELECT *
        FROM lab_operation
        WHERE workspace_id = ${input.workspaceId}
          AND idempotency_key = ${input.idempotencyKey}
        LIMIT 1
      `;

      if (existing[0]) {
        if (existing[0].request_hash !== input.requestHash) {
          throw new Error("IDEMPOTENCY_KEY_CONFLICT");
        }

        return { operation: mapOperation(existing[0]), created: false };
      }

      const operationId = uuidv7();
      const outboxId = uuidv7();

      const operationRows = await tx<OperationRow[]>`
        INSERT INTO lab_operation (
          id,
          workspace_id,
          idempotency_key,
          operation_type,
          status,
          requested_by,
          correlation_id,
          request_hash
        )
        VALUES (
          ${operationId},
          ${input.workspaceId},
          ${input.idempotencyKey},
          ${input.operationType},
          'queued',
          ${input.requestedBy},
          ${input.correlationId},
          ${input.requestHash}
        )
        RETURNING *
      `;

      const locked = await tx<{ id: string }[]>`
        UPDATE lab_workspace
        SET
          active_operation_id = ${operationId},
          lifecycle_version = lifecycle_version + 1,
          updated_at = now()
        WHERE id = ${input.workspaceId}
          AND active_operation_id IS NULL
        RETURNING id
      `;

      if (!locked[0]) {
        throw new Error("WORKSPACE_BUSY");
      }

      await tx`
        INSERT INTO outbox_event (
          id,
          aggregate_type,
          aggregate_id,
          event_type,
          payload_json
        )
        VALUES (
          ${outboxId},
          'LabWorkspace',
          ${input.workspaceId},
          'LabOperationRequested',
          ${JSON.stringify({
            operationId,
            workspaceId: input.workspaceId,
            operationType: input.operationType,
          })}::jsonb
        )
      `;

      const operation = operationRows[0];
      if (!operation) throw new Error("operation insert returned no row");

      return { operation: mapOperation(operation), created: true };
    });
  } finally {
    await sql.end();
  }
}

export async function setOperationStatus(input: {
  databaseUrl: string;
  operationId: string;
  status: LabOperationStatus;
  errorCode?: string;
}): Promise<void> {
  const sql = postgres(input.databaseUrl, { max: 1 });
  const terminal = ["succeeded", "failed", "cancelled", "timedOut"].includes(
    input.status,
  );

  try {
    await sql.begin(async (tx) => {
      const rows = await tx<{ workspace_id: string }[]>`
        UPDATE lab_operation
        SET
          status = ${input.status},
          error_code = ${input.errorCode ?? null},
          started_at = CASE
            WHEN ${input.status} = 'running' AND started_at IS NULL THEN now()
            ELSE started_at
          END,
          completed_at = CASE
            WHEN ${terminal} THEN now()
            ELSE completed_at
          END
        WHERE id = ${input.operationId}
        RETURNING workspace_id
      `;

      const row = rows[0];
      if (!row) throw new Error("operation not found");

      if (terminal) {
        await tx`
          UPDATE lab_workspace
          SET
            active_operation_id = NULL,
            lifecycle_version = lifecycle_version + 1,
            updated_at = now()
          WHERE id = ${row.workspace_id}
            AND active_operation_id = ${input.operationId}
        `;
      }
    });
  } finally {
    await sql.end();
  }
}

export async function listPendingOutbox(input: {
  databaseUrl: string;
  limit?: number;
}): Promise<OutboxRow[]> {
  const sql = postgres(input.databaseUrl, { max: 1 });

  try {
    const limit = input.limit ?? 50;
    return await sql<OutboxRow[]>`
      SELECT id, aggregate_id, event_type, payload_json, retry_count
      FROM outbox_event
      WHERE published_at IS NULL
      ORDER BY created_at
      LIMIT ${limit}
    `;
  } finally {
    await sql.end();
  }
}

export async function markOutboxPublished(input: {
  databaseUrl: string;
  eventId: string;
}): Promise<void> {
  const sql = postgres(input.databaseUrl, { max: 1 });
  try {
    await sql`
      UPDATE outbox_event
      SET published_at = now(), last_error = NULL
      WHERE id = ${input.eventId}
    `;
  } finally {
    await sql.end();
  }
}

export async function markOutboxFailed(input: {
  databaseUrl: string;
  eventId: string;
  error: string;
}): Promise<void> {
  const sql = postgres(input.databaseUrl, { max: 1 });
  try {
    await sql`
      UPDATE outbox_event
      SET retry_count = retry_count + 1, last_error = ${input.error}
      WHERE id = ${input.eventId}
    `;
  } finally {
    await sql.end();
  }
}

export async function findStaleOperations(input: {
  databaseUrl: string;
  olderThan: Date;
}): Promise<LabOperationRecord[]> {
  const sql = postgres(input.databaseUrl, { max: 1 });
  try {
    const rows = await sql<OperationRow[]>`
      SELECT *
      FROM lab_operation
      WHERE status IN ('queued', 'waitingForCapacity', 'running', 'compensating')
        AND created_at < ${input.olderThan}
      ORDER BY created_at
    `;
    return rows.map(mapOperation);
  } finally {
    await sql.end();
  }
}

export async function getLifecycleOperation(input: {
  databaseUrl: string;
  operationId: string;
}): Promise<LabOperationRecord | null> {
  const sql = postgres(input.databaseUrl, { max: 1 });
  try {
    const rows = await sql<OperationRow[]>`
      SELECT *
      FROM lab_operation
      WHERE id = ${input.operationId}
      LIMIT 1
    `;
    return rows[0] ? mapOperation(rows[0]) : null;
  } finally {
    await sql.end();
  }
}
