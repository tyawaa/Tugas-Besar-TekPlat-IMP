ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS billing_type TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS access_price INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'IDR';

ALTER TABLE devices
  DROP CONSTRAINT IF EXISTS devices_billing_type_check;

ALTER TABLE devices
  ADD CONSTRAINT devices_billing_type_check
  CHECK (billing_type IN ('free', 'one_time'));

ALTER TABLE access_requests
  DROP CONSTRAINT IF EXISTS access_requests_status_check;

ALTER TABLE access_requests
  ADD CONSTRAINT access_requests_status_check
  CHECK (status IN ('pending', 'pending_payment', 'approved', 'rejected', 'revoked', 'cancelled'));

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  access_request_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  buyer_id TEXT NOT NULL,
  seller_id TEXT NOT NULL,
  total_amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'IDR',
  payment_method TEXT,
  payment_status TEXT NOT NULL CHECK (payment_status IN ('PENDING', 'PAID', 'FAILED', 'EXPIRED')),
  snap_token TEXT,
  midtrans_order_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_access_request_id ON orders (access_request_id);
CREATE INDEX IF NOT EXISTS idx_orders_midtrans_order_id ON orders (midtrans_order_id);
