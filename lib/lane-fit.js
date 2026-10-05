// A laned diagram is stored with room to breathe. The stored lane says which
// band a card is in and how thick that band may draw, and an agent lays the
// cards out on a grid it picks - so a note ran out of the bottom of its band, a
// card sat on the lane title, and a line's tag landed on the boxes either side
// of it. The fix lives where lanes, notes and cards are written: open the gaps
// until what sits in them fits, pad every band alike, and the canvas and every
// export have room to draw the diagram.
import db from "./db.js";
import { cleanLanes, laneAxis, spaceLanes, LANE_FIT, LANE_GAP } from "../src/lanes.js";
import { spaceTracks } from "../src/space.js";
import { contentRects, tagSize } from "./render-svg.js";

const TAG_PAD = 12; // clear space each side of a tag in the gap it sits in
const NOTE_PAD = 10; // under a note before the next row of cards

// What has to fit in the gap between 2 neighbouring columns (the tag on a line
// crossing it) or rows (a tag, and the note hanging under the card above). Only
// cards that actually stand beside each other count: on a hand-placed diagram
// two cards can share an axis value and never be in each other's way.
function wanted(rects, edges, axis) {
  const [at, ot, os] = axis === "col" ? ["x", "y", "h"] : ["y", "x", "w"];
  const beside = (a, b) => a[ot] < b[ot] + b[os] && b[ot] < a[ot] + a[os];
  const by = new Map(rects.map((r) => [r.id, r]));
  const key = (a, b) => `${Math.min(a[at], b[at])}|${Math.max(a[at], b[at])}`;
  const tag = new Map(), note = new Map();
  const bump = (m, k, v) => m.set(k, Math.max(m.get(k) || 0, v));
  for (const e of edges || []) {
    const a = by.get(e.source), b = by.get(e.target);
    if (!a || !b || a[at] === b[at] || !beside(a, b)) continue;
    const t = tagSize(e);
    if (t.w) bump(tag, key(a, b), (axis === "col" ? t.w : t.h) + 2 * TAG_PAD);
  }
  // A note hangs under its card, so it has to clear whatever stands below it.
  if (axis === "row") for (const a of rects) if (a.noteH) for (const b of rects) if (b.y > a.y && beside(a, b)) bump(note, key(a, b), a.noteH);
  // A tag rides the middle of the gap it crosses, so a gap with a note in it has
  // to be twice the note plus the tag for the tag to come out under the note.
  const want = (prev, cur) => {
    const n = note.get(`${prev}|${cur}`) || 0, t = tag.get(`${prev}|${cur}`) || 0;
    return Math.max(n && n + NOTE_PAD, t && (axis === "row" ? 2 * n + t : t));
  };
  return { want, maxTag: Math.max(0, ...tag.values()) };
}

// Pure: the nodes and lanes to store, or null when nothing has to move.
export function spaceFlow(nodes, edges, lanes) {
  const clean = cleanLanes(lanes);
  if (!clean.length) return null;
  const rects = contentRects(nodes);
  const was = new Map(rects.map((r) => [r.id, { x: r.x, y: r.y }]));
  let pad = LANE_FIT;
  for (const axis of ["col", "row"]) {
    const at = axis === "col" ? "x" : "y";
    const { want, maxTag } = wanted(rects, edges, axis);
    const by = spaceTracks(rects, axis, want);
    for (const r of rects) r[at] += by.get(r.id) || 0;
    // A line crossing from one band to the next carries its tag through
    // pad + LANE_GAP + pad, so the pad opens up until the widest one fits. Every
    // band of the diagram gets the same pad, the way every gap is LANE_GAP.
    if (axis === laneAxis(clean)) pad = Math.max(pad, Math.ceil((maxTag - LANE_GAP) / 2));
  }
  const at = laneAxis(clean) === "col" ? "x" : "y";
  const { lanes: spaced, shift } = spaceLanes(clean, rects.map((r) => ({ ...r, h: r.h + r.noteH })), pad);
  for (const r of rects) r[at] += shift.get(r.id) || 0;
  const byId = new Map(rects.map((r) => [r.id, r]));
  let moved = 0;
  const out = (nodes || []).map((n) => {
    const r = byId.get(n && n.id), from = was.get(n && n.id);
    if (!r || (r.x === from.x && r.y === from.y)) return n;
    moved += 1;
    return { ...n, position: { x: Math.round(r.x), y: Math.round(r.y) } };
  });
  if (!moved && JSON.stringify(spaced) === JSON.stringify(clean)) return null;
  return { nodes: out, lanes: spaced };
}

// Called after any write that can change how much room a diagram needs: a note
// edited, a card moved or resized, lanes configured. A no-op (1 small read) on a
// diagram without lanes, which is most of them.
export async function respaceLanes(id, userId) {
  const read = await db.query(
    "SELECT nodes, edges, view_state FROM flows WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
    [id, userId],
  );
  const row = read?.rows?.[0];
  if (!row) return null;
  const out = spaceFlow(row.nodes, row.edges, row.view_state?.lanes);
  if (!out) return null;
  await db.query(
    "UPDATE flows SET nodes = $1::jsonb, view_state = COALESCE(view_state, '{}'::jsonb) || $2::jsonb WHERE id = $3 AND user_id = $4 AND deleted_at IS NULL",
    [JSON.stringify(out.nodes), JSON.stringify({ lanes: out.lanes }), id, userId],
  );
  return out.lanes;
}
