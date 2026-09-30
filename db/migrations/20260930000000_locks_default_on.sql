-- Every flow starts locked, both ways. The delete lock is the owner's: an
-- agent with the MCP server or the API token can no longer trash a flow,
-- and cannot lift the lock either. The edit lock is new and does the same
-- for content: while it is on, an agent cannot update or restore a version.
-- The owner lifts either one in the app, on purpose, for the flow that
-- needs it. Existing rows are locked too: they were all open until now.

ALTER TABLE flows ALTER COLUMN locked SET DEFAULT true;
ALTER TABLE flows ADD COLUMN IF NOT EXISTS edit_locked boolean NOT NULL DEFAULT true;
UPDATE flows SET locked = true, edit_locked = true;
