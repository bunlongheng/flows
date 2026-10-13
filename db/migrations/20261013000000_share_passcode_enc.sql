-- The owner wants to SEE the current passcode in the app, and a scrypt hash
-- cannot be read back. So the passcode is also kept AES-256-GCM sealed under
-- AUTH_SECRET (lib/passcode.js sealPasscode), and opened only for the owner.
-- passcode_hash stays the thing the lock screen verifies against.

ALTER TABLE flows ADD COLUMN IF NOT EXISTS passcode_enc text;
