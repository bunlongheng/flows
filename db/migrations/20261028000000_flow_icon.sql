-- 1 icon that best describes the whole diagram, drawn next to its title in the
-- gallery and the detail view. NULL = none set: the app falls back to the
-- first card's logo. Stored resolved (a path, https URL or data: URI).

ALTER TABLE flows ADD COLUMN IF NOT EXISTS icon text;
