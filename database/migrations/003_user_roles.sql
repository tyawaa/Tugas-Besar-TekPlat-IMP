ALTER TABLE users
  ADD COLUMN IF NOT EXISTS roles JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE users
SET roles = to_jsonb(ARRAY[role])
WHERE roles = '[]'::jsonb;
