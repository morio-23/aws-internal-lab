CREATE TABLE IF NOT EXISTS lab_workspace (
  id uuid PRIMARY KEY,
  owner_user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
  virtual_account_id char(12) NOT NULL UNIQUE
    CHECK (virtual_account_id ~ '^[0-9]{12}$'),
  partition_name text NOT NULL DEFAULT 'aws',
  primary_virtual_region text NOT NULL
    CHECK (primary_virtual_region IN ('ap-northeast-1', 'ap-northeast-3')),
  enabled_regions jsonb NOT NULL DEFAULT '["ap-northeast-1","ap-northeast-3"]'::jsonb,
  status text NOT NULL DEFAULT 'inactive',
  active_session_id uuid,
  current_snapshot_id uuid,
  standard_eligible boolean NOT NULL DEFAULT true,
  lifecycle_version bigint NOT NULL DEFAULT 0,
  active_operation_id uuid,
  dr_scenario_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_lab_workspace_owner
  ON lab_workspace(owner_user_id)
  WHERE deleted_at IS NULL;
