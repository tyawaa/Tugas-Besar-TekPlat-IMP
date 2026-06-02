CREATE TABLE IF NOT EXISTS schema_migrations (
  filename TEXT PRIMARY KEY,
  checksum TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('device_owner', 'developer', 'admin')),
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'suspended'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  location TEXT NOT NULL,
  description TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('online', 'offline', 'suspended', 'archived')),
  visibility TEXT NOT NULL CHECK (visibility IN ('private', 'catalog')),
  last_seen TEXT NOT NULL,
  heartbeat_interval INTEGER NOT NULL,
  metrics JSONB NOT NULL DEFAULT '[]'::jsonb,
  api_key TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS telemetry (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS access_requests (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  developer_id TEXT NOT NULL,
  developer_name TEXT NOT NULL,
  developer_email TEXT NOT NULL,
  purpose TEXT NOT NULL,
  scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  requested_until TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'revoked', 'cancelled')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS access_grants (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  developer_id TEXT NOT NULL,
  developer_name TEXT NOT NULL,
  scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  expires_at TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL,
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('device_owner', 'developer', 'admin')),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('device', 'user', 'access_request', 'access_grant')),
  target_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure')),
  details TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions (token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);
CREATE INDEX IF NOT EXISTS idx_devices_owner_id ON devices (owner_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_device_observed_at ON telemetry (device_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_requests_device_id ON access_requests (device_id);
CREATE INDEX IF NOT EXISTS idx_access_requests_developer_id ON access_requests (developer_id);
CREATE INDEX IF NOT EXISTS idx_access_grants_device_id ON access_grants (device_id);
CREATE INDEX IF NOT EXISTS idx_access_grants_developer_id ON access_grants (developer_id);
CREATE INDEX IF NOT EXISTS idx_access_grants_token ON access_grants (token);
CREATE INDEX IF NOT EXISTS idx_audit_logs_occurred_at ON audit_logs (occurred_at DESC);
