// A swimlane keeps up with its notes. The stored lane says which band a card is
// in and how thick that band may draw, so a note longer than the band ran out of
// the bottom of it: fitLanes can tighten a band when notes are hidden but may
// never grow one past the next band's start. The fix lives where lanes and notes
// are written - give every band the room its content takes, push the later bands
// (and the cards inside them) down by what it grew, and the canvas and every
// export have room to draw the note.
import db from "./db.js";
import { cleanLanes, laneAxis, spaceLanes } from "../src/lanes.js";
import { contentRects } from "./render-svg.js";

// Pure: the nodes and lanes to store, or null when nothing has to move.
export function spaceFlow(nodes, lanes) {
  const clean = cleanLanes(lanes);
  if (!clean.length) return null;
  const { lanes: spaced, shift } = spaceLanes(clean, contentRects(nodes));
  if (!shift.size && JSON.stringify(spaced) === JSON.stringify(clean)) return null;
  const at = laneAxis(clean) === "col" ? "x" : "y";
  const moved = (nodes || []).map((n) => {
    const d = shift.get(n && n.id);
    return d ? { ...n, position: { ...n.position, [at]: n.position[at] + d } } : n;
  });
  return { nodes: moved, lanes: spaced };
}

// Called after any write that can change how much room a lane needs: a note
// edited, a card moved or resized, lanes configured. A no-op (1 small read) on a
// diagram without lanes, which is most of them.
export async function respaceLanes(id, userId, nodes = null) {
  const read = await db.query(
    `SELECT view_state${nodes ? "" : ", nodes"} FROM flows WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [id, userId],
  );
  const row = read?.rows?.[0];
  if (!row) return null;
  const out = spaceFlow(nodes || row.nodes, row.view_state?.lanes);
  if (!out) return null;
  await db.query(
    "UPDATE flows SET nodes = $1::jsonb, view_state = COALESCE(view_state, '{}'::jsonb) || $2::jsonb WHERE id = $3 AND user_id = $4 AND deleted_at IS NULL",
    [JSON.stringify(out.nodes), JSON.stringify({ lanes: out.lanes }), id, userId],
  );
  return out.lanes;
}
