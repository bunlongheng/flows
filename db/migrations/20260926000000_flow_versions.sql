-- Every flow keeps its history. Agents rewrite diagrams through the MCP server
-- and the API, and until now a bad rewrite had no way back. A trigger on flows
-- copies the OLD row into flow_versions whenever anything a reader would notice
-- changes (title, pattern, description, nodes, edges), whoever wrote it and
-- whichever door they came through, so the app, the API and the MCP server all
-- get history for free.
--
-- kind tells a layout save (drag, resize, stretch an icon, bend an edge) from a
-- content change (anything else). Layout saves are frequent and boring, so one
-- is kept per 10 minutes; content changes are always kept.
--
-- reason is the update_reason the REPLACING write gave, when it gave a fresh
-- one: the row holds the state from before that reason was applied.

CREATE TABLE IF NOT EXISTS flow_versions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id     uuid NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  title       text,
  nodes       jsonb,
  edges       jsonb,
  pattern     text,
  description text,
  view_state  jsonb,
  reason      text,
  kind        text NOT NULL CHECK (kind IN ('layout', 'content')),
  saved_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS flow_versions_flow_saved ON flow_versions (flow_id, saved_at DESC);

-- Nodes without where they sit and how big they are; edges without their
-- handle ends and bends. What is left is the content of the diagram.
CREATE OR REPLACE FUNCTION flow_versions_content(nodes jsonb, edges jsonb) RETURNS jsonb AS $$
  SELECT jsonb_build_object(
    'nodes', COALESCE((SELECT jsonb_agg(n - 'position' - 'size' - 'iconSize' ORDER BY i)
                         FROM jsonb_array_elements(COALESCE(nodes, '[]'::jsonb)) WITH ORDINALITY AS t(n, i)), '[]'::jsonb),
    'edges', COALESCE((SELECT jsonb_agg(e - 'labelT' - 'ends' - 'bend' ORDER BY i)
                         FROM jsonb_array_elements(COALESCE(edges, '[]'::jsonb)) WITH ORDINALITY AS t(e, i)), '[]'::jsonb)
  );
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION flow_versions_keep() RETURNS trigger AS $$
DECLARE
  k    text;
  last record;
BEGIN
  IF OLD.title IS NOT DISTINCT FROM NEW.title
     AND OLD.pattern IS NOT DISTINCT FROM NEW.pattern
     AND OLD.description IS NOT DISTINCT FROM NEW.description
     AND OLD.nodes IS NOT DISTINCT FROM NEW.nodes
     AND OLD.edges IS NOT DISTINCT FROM NEW.edges THEN
    RETURN NEW;
  END IF;

  IF OLD.title IS DISTINCT FROM NEW.title
     OR OLD.pattern IS DISTINCT FROM NEW.pattern
     OR OLD.description IS DISTINCT FROM NEW.description
     OR flow_versions_content(OLD.nodes, OLD.edges) IS DISTINCT FROM flow_versions_content(NEW.nodes, NEW.edges) THEN
    k := 'content';
  ELSE
    k := 'layout';
    SELECT kind, saved_at INTO last FROM flow_versions
      WHERE flow_id = OLD.id ORDER BY saved_at DESC LIMIT 1;
    IF FOUND AND last.kind = 'layout' AND last.saved_at > now() - interval '10 minutes' THEN
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO flow_versions (flow_id, title, nodes, edges, pattern, description, view_state, reason, kind)
  VALUES (OLD.id, OLD.title, OLD.nodes, OLD.edges, OLD.pattern, OLD.description, OLD.view_state,
          CASE WHEN NEW.update_reason IS DISTINCT FROM OLD.update_reason THEN NEW.update_reason END, k);

  -- A diagram of photos carries every photo in every version; 50 is plenty.
  DELETE FROM flow_versions WHERE flow_id = OLD.id AND id NOT IN (
    SELECT id FROM flow_versions WHERE flow_id = OLD.id ORDER BY saved_at DESC LIMIT 50);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS flow_versions_keep ON flows;
CREATE TRIGGER flow_versions_keep BEFORE UPDATE ON flows
  FOR EACH ROW EXECUTE FUNCTION flow_versions_keep();
