-- Additive migration. Apply before deploying the corresponding API changes.
CREATE TABLE IF NOT EXISTS account_deletions (
  user_id text PRIMARY KEY,
  requested_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE photos ADD COLUMN IF NOT EXISTS raw_purged_at timestamptz;

CREATE TABLE IF NOT EXISTS photo_deletions (
  photo_id text PRIMARY KEY,
  raw_path text NOT NULL,
  not_before timestamptz NOT NULL
);
