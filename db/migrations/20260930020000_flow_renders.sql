-- A finished GIF render of a flow, keyed by the row's last change and the
-- size asked for. Rendering is 20 rasterises and a few seconds on Vercel;
-- a README or GitHub's image proxy should get a lookup, not a render.
-- Renders of older versions of the flow are dropped when a new one lands.
CREATE TABLE IF NOT EXISTS flow_renders (
  flow_id    uuid NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  key        text NOT NULL,
  bytes      bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (flow_id, key)
);
