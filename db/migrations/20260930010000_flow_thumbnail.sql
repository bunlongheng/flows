-- The gallery tile is a real capture of the canvas, taken by the app the
-- moment the owner opens or changes a flow. Rows made by agents have none
-- until then and the tile falls back to the SVG render.
ALTER TABLE flows ADD COLUMN IF NOT EXISTS thumbnail text;
ALTER TABLE flows ADD COLUMN IF NOT EXISTS thumbnail_at timestamptz;
