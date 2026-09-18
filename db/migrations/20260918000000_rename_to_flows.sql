-- Rename the artifact store from system_designs to flows. The app kept the
-- domain term as its table name; the product is now called Flows, so the
-- schema follows. Idempotent: a fresh database applies the seven migrations
-- above first (which build system_designs), then this renames it, so both a
-- new database and the live one converge on the same end state.

ALTER TABLE IF EXISTS system_designs RENAME TO flows;

ALTER INDEX IF EXISTS idx_system_designs_user_id      RENAME TO idx_flows_user_id;
ALTER INDEX IF EXISTS idx_system_designs_slug         RENAME TO idx_flows_slug;
ALTER INDEX IF EXISTS idx_system_designs_public       RENAME TO idx_flows_public;
ALTER INDEX IF EXISTS system_designs_deleted_at_idx   RENAME TO flows_deleted_at_idx;

-- Postgres does not rename the primary key constraint with the table.
ALTER INDEX IF EXISTS system_designs_pkey RENAME TO flows_pkey;

-- The `type` label on each row followed the old product name. One row is one flow.
ALTER TABLE flows ALTER COLUMN type SET DEFAULT 'flow';
UPDATE flows SET type = 'flow' WHERE type = 'system-design';
