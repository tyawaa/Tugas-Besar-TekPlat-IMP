-- Retry payment is represented by multiple rows in orders for one access_request_id.
-- This migration does not create a separate payment_attempts table.
-- Existing Midtrans callbacks continue to match the correct local attempt via midtrans_order_id.

ALTER TABLE access_requests
  ADD COLUMN IF NOT EXISTS billing_snapshot JSONB;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS snap_redirect_url TEXT,
  ADD COLUMN IF NOT EXISTS billing_snapshot JSONB;

ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_payment_status_check;

ALTER TABLE orders
  ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN (
    'PENDING', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED', 'DENIED',
    'REFUNDED', 'PARTIAL_REFUND', 'CHARGEBACK', 'PARTIAL_CHARGEBACK'
  ));
