-- The edit lock is the rare exception, not the default. With it on by
-- default, an agent on either machine was refused on every existing flow
-- and made a new one instead, so the gallery filled with near copies.
-- A flow now starts open to agents; the owner turns the edit lock on by
-- hand, in the app, for the flow that must not change. Existing rows open
-- too. The delete lock keeps its default: on.

ALTER TABLE flows ALTER COLUMN edit_locked SET DEFAULT false;
UPDATE flows SET edit_locked = false;
