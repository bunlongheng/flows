// What the OWNER set by hand on the canvas, and what an agent must never erase
// by accident.
//
// update_flow replaces the whole nodes/edges array. Before this existed, the
// MCP schema dropped every key it did not declare, so a caller that only meant
// to fix one label wiped every resized card, every styled line, every dragged
// step badge and every hand bend on the diagram - silently, with a 200 back.
// Now anything the caller STATES wins, and anything it leaves out is carried
// over from the row as it stands.
export const NODE_KEEP = ["size", "iconSize", "style"];
export const EDGE_KEEP = ["style", "labelT", "bend"];

// A box is only a box when both sides are real numbers in range. The clamp
// matches the API's (lib/handlers/flow-by-id.js) so both doors store the same.
export const okBox = (b, lo, hi) =>
  !!b && Number.isFinite(b.w) && Number.isFinite(b.h) &&
  b.w >= lo && b.w <= hi && b.h >= lo && b.h <= hi;
export const roundBox = (b) => ({ w: Math.round(b.w), h: Math.round(b.h) });

// Edge identity. An id is what matches a line to its stored look; without one
// the position in the array has to stand in, which is why every edge should
// carry a stable id - insert one in the middle and the fallback re-points the
// styling of every line after it.
export const edgeKey = (e, i) => (e && e.id) || `e${i + 1}`;

/** Carry `keys` from the stored list onto the incoming one, matched by `keyOf`. */
export function keepOwnerWork(incoming, stored, keys, keyOf) {
  const was = new Map((stored || []).map((o, i) => [keyOf(o, i), o]));
  return (incoming || []).map((o, i) => {
    const prev = was.get(keyOf(o, i));
    if (!prev) return o;
    const carried = {};
    for (const k of keys) if (o[k] === undefined && prev[k] !== undefined) carried[k] = prev[k];
    return Object.keys(carried).length ? { ...o, ...carried } : o;
  });
}
