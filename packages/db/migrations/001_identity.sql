BEGIN;

CREATE TABLE IF NOT EXISTS app_user (
  id uuid PRIMARY KEY,
  external_subject text NOT NULL UNIQUE,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS role_assignment (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('Learner', 'Operator', 'Administrator', 'SecurityAuditor')),
  source text NOT NULL DEFAULT 'platform',
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

COMMIT;
