-- A passcode on a shared flow, like a Stickies private share. NULL = no
-- passcode. Only the scrypt hash is stored (lib/passcode.js); a visitor
-- without the unlock cookie gets the lock screen instead of the row.

ALTER TABLE flows ADD COLUMN IF NOT EXISTS passcode_hash text;
