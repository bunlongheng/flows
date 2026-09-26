-- A layout-only write that gives a reason is deliberate - a restore, or an
-- agent's update_flow with a note - so it is always kept. Only the silent
-- drag-and-drop saves coalesce to one per 10 minutes. Without this, restoring
-- a layout version within 10 minutes of a drag left nothing to undo the restore
-- with.

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
    IF NEW.update_reason IS NOT DISTINCT FROM OLD.update_reason THEN
      SELECT kind, saved_at INTO last FROM flow_versions
        WHERE flow_id = OLD.id ORDER BY saved_at DESC LIMIT 1;
      IF FOUND AND last.kind = 'layout' AND last.saved_at > now() - interval '10 minutes' THEN
        RETURN NEW;
      END IF;
    END IF;
  END IF;

  INSERT INTO flow_versions (flow_id, title, nodes, edges, pattern, description, view_state, reason, kind)
  VALUES (OLD.id, OLD.title, OLD.nodes, OLD.edges, OLD.pattern, OLD.description, OLD.view_state,
          CASE WHEN NEW.update_reason IS DISTINCT FROM OLD.update_reason THEN NEW.update_reason END, k);

  DELETE FROM flow_versions WHERE flow_id = OLD.id AND id NOT IN (
    SELECT id FROM flow_versions WHERE flow_id = OLD.id ORDER BY saved_at DESC LIMIT 50);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
