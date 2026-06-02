ALTER TABLE access_requests
  DROP CONSTRAINT IF EXISTS access_requests_status_check;

ALTER TABLE access_requests
  ADD CONSTRAINT access_requests_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'revoked', 'cancelled'));
