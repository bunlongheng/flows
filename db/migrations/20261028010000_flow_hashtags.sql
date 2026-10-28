-- A flow's hashtags, shown as #pills beside its title. Usually 1, up to 5,
-- stored without the "#" (src/hashtags.js). Kept apart from `tags`, which
-- holds the system labels (API, MCP, linked).

ALTER TABLE flows ADD COLUMN IF NOT EXISTS hashtags text[] NOT NULL DEFAULT '{}';
