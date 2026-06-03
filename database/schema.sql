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
  roles JSONB NOT NULL DEFAULT '[]'::jsonb,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'suspended')),
    two_factor_enabled BOOLEAN NOT NULL DEFAULT false,
    two_factor_code_hash TEXT,
    two_factor_code_expires_at TEXT,
    password_reset_code_hash TEXT,
    password_reset_code_expires_at TEXT
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
  created_at TEXT NOT NULL,
  billing_type TEXT NOT NULL DEFAULT 'free' CHECK (billing_type IN ('free', 'one_time')),
  access_price INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'IDR'
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
  status TEXT NOT NULL CHECK (status IN ('pending', 'pending_payment', 'approved', 'rejected', 'revoked', 'cancelled')),
  billing_snapshot JSONB,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  access_request_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  buyer_id TEXT NOT NULL,
  seller_id TEXT NOT NULL,
  total_amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'IDR',
  payment_method TEXT,
  payment_status TEXT NOT NULL CHECK (payment_status IN (
    'PENDING', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED', 'DENIED',
    'REFUNDED', 'PARTIAL_REFUND', 'CHARGEBACK', 'PARTIAL_CHARGEBACK'
  )),
  payout_status TEXT NOT NULL DEFAULT 'NOT_ELIGIBLE' CHECK (payout_status IN ('NOT_ELIGIBLE', 'ELIGIBLE', 'PAID_OUT', 'REFUND_REQUIRED', 'REFUNDED')),
  platform_fee INTEGER NOT NULL DEFAULT 0,
  owner_amount INTEGER NOT NULL DEFAULT 0,
  paid_out_at TEXT,
  snap_token TEXT,
  snap_redirect_url TEXT,
  midtrans_order_id TEXT NOT NULL UNIQUE,
  billing_snapshot JSONB,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
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
CREATE INDEX IF NOT EXISTS idx_orders_access_request_id ON orders (access_request_id);
CREATE INDEX IF NOT EXISTS idx_orders_midtrans_order_id ON orders (midtrans_order_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_one_pending_per_access_request
  ON orders (access_request_id)
  WHERE payment_status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_access_grants_device_id ON access_grants (device_id);
CREATE INDEX IF NOT EXISTS idx_access_grants_developer_id ON access_grants (developer_id);
CREATE INDEX IF NOT EXISTS idx_access_grants_token ON access_grants (token);
CREATE INDEX IF NOT EXISTS idx_audit_logs_occurred_at ON audit_logs (occurred_at DESC);
