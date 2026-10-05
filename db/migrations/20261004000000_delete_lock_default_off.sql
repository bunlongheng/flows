-- The delete lock stops being the default. An agent that creates a flow
-- through the API or MCP often has to throw it away a minute later: a wrong
-- title, a duplicate, a layout that came out bad. With the lock on at birth
-- every one of those was a 409 only the owner could clear, so the gallery
-- collected junk nobody could remove. A new flow now starts open to delete.
-- That is still a soft delete into trash, and a purge is still a second
-- deliberate call, so nothing here becomes irreversible.
--
-- Existing rows keep their lock on purpose: those are the hand-made and
-- README-embedded flows, and the owner lifts the lock in the app for the one
-- that needs it. The edit lock is untouched (off by default since
-- 20260930030000).

ALTER TABLE flows ALTER COLUMN locked SET DEFAULT false;
