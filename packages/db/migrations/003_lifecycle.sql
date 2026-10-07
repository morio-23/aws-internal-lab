CREATE TABLE IF NOT EXISTS lab_session (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES lab_workspace(id) ON DELETE CASCADE,
  status text NOT NULL,
  runtime_type text NOT NULL CHECK (runtime_type IN ('standard', 'advanced')),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lab_runtime (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL UNIQUE REFERENCES lab_session(id) ON DELETE CASCADE,
  runtime_type text NOT NULL CHECK (runtime_type IN ('standard', 'advanced')),
  provider_ref text,
  private_endpoint text,
  status text NOT NULL,
  heartbeat_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS lab_operation (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES lab_workspace(id) ON DELETE CASCADE,
  session_id uuid REFERENCES lab_session(id) ON DELETE SET NULL,
  idempotency_key text NOT NULL,
  operation_type text NOT NULL,
  status text NOT NULL CHECK (
    status IN (
      'queued',
      'waitingForCapacity',
      'running',
      'compensating',
      'succeeded',
      'failed',
      'cancelled',
      'timedOut'
    )
  ),
  requested_by text NOT NULL,
  correlation_id text NOT NULL,
  request_hash text NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  result_json jsonb,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  UNIQUE (workspace_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS outbox_event (
  id uuid PRIMARY KEY,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  event_type text NOT NULL,
  payload_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  retry_count integer NOT NULL DEFAULT 0,
  last_error text
);

CREATE INDEX IF NOT EXISTS idx_outbox_pending
  ON outbox_event(created_at)
  WHERE published_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_lab_operation_active
  ON lab_operation(workspace_id, created_at)
  WHERE status IN ('queued', 'waitingForCapacity', 'running', 'compensating');

ALTER TABLE lab_workspace
  ADD CONSTRAINT fk_workspace_active_session
  FOREIGN KEY (active_session_id) REFERENCES lab_session(id) ON DELETE SET NULL;

ALTER TABLE lab_workspace
  ADD CONSTRAINT fk_workspace_active_operation
  FOREIGN KEY (active_operation_id) REFERENCES lab_operation(id) ON DELETE SET NULL;
