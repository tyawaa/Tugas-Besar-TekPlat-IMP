ALTER TABLE users
  ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS two_factor_code_hash TEXT,
  ADD COLUMN IF NOT EXISTS two_factor_code_expires_at TEXT,
  ADD COLUMN IF NOT EXISTS password_reset_code_hash TEXT,
  ADD COLUMN IF NOT EXISTS password_reset_code_expires_at TEXT;
