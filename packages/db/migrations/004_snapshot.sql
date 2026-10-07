ALTER TABLE lab_runtime
  ADD COLUMN IF NOT EXISTS state_volume_ref text;

CREATE TABLE IF NOT EXISTS lab_snapshot (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES lab_workspace(id) ON DELETE CASCADE,
  source_session_id uuid REFERENCES lab_session(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (
    status IN (
      'creating',
      'available',
      'restoring',
      'expired',
      'deleting',
      'deleted',
      'failed',
      'quarantined'
    )
  ),
  runtime_type text NOT NULL CHECK (runtime_type IN ('standard', 'advanced')),
  payload_type text NOT NULL,
  provider_snapshot_ref text,
  manifest_key text,
  consistency_level text NOT NULL CHECK (
    consistency_level IN (
      'application-consistent',
      'configuration-consistent',
      'crash-consistent'
    )
  ),
  snapshot_format_version integer NOT NULL DEFAULT 1,
  size_bytes bigint,
  engine_version text,
  engine_image_digest text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_restored_at timestamptz,
  error_code text,
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_lab_snapshot_workspace_created
  ON lab_snapshot(workspace_id, created_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE lab_workspace
  ADD CONSTRAINT fk_workspace_current_snapshot
  FOREIGN KEY (current_snapshot_id) REFERENCES lab_snapshot(id) ON DELETE SET NULL;
