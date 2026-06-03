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
