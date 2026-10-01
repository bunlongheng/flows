-- Who opened a shared flow. 1 row per real view of a public share link, so
-- nothing is lost before an email provider is configured. Read by
-- lib/share-alert.js, which also numbers the views from it.
CREATE TABLE IF NOT EXISTS flow_view_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL,
  title TEXT,
  kind TEXT NOT NULL DEFAULT 'view',
  ip TEXT,
  city TEXT,
  country TEXT,
  user_agent TEXT,
  referer TEXT,
  emailed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS flow_view_log_flow_id_idx ON flow_view_log (flow_id, created_at DESC);
