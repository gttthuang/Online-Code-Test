-- Add per-user password hashes. Existing accounts are backfilled with the hash
-- of the default demo password ("1234567890"); the scrypt salt is baked into the
-- literal below so the backfill is deterministic and verifiable at login.
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;

UPDATE users
SET password_hash = 'scrypt:97b5691356aad28b5e843923ef802863:c9c30bed0d9d4a5299e908a23bbdea77968c07ce40d1165a254326146976f498f8f032306ec9fb19bd77110399614aff6d2d979be2f45a787b1939b66a7179b2'
WHERE password_hash IS NULL;

ALTER TABLE users ALTER COLUMN password_hash SET NOT NULL;
