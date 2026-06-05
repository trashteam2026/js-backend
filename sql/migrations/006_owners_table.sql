-- 006: owners table (move owner authorization from OWNER_EMAILS env to DB)
-- Replaces the OWNER_EMAILS allowlist with a queryable owners table so owner
-- access can be granted/revoked with a single row instead of a secret rotation.
-- Emails are stored lower+trimmed to match authMiddleware's normalized compare.
-- Seeds the five current owners from the live OWNER_EMAILS value.
-- Verified 2026-06-04: no existing owners table; safe to create.

CREATE TABLE IF NOT EXISTS owners (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO owners (email)
VALUES
  (LOWER(TRIM('ohjinwoo0608@gmail.com'))),
  (LOWER(TRIM('Albert0515kim@gmail.com'))),
  (LOWER(TRIM('cameronlam2028@u.northwestern.edu'))),
  (LOWER(TRIM('fayma2029@u.northwestern.edu'))),
  (LOWER(TRIM('trashteam2026@gmail.com')))
ON CONFLICT (email) DO NOTHING;
