// Swimlanes: horizontal bands the owner lays cards into, 1 per layer of the
// system (VISITOR, APPS, RELAY, INBOX). Optional, per diagram, saved in
// view_state.lanes as { id, title, y, h, color? }: a lane spans the whole
// diagram, so only its top and height are the owner's. The canvas and every
// export draw them from this 1 file so they match.

export const LANE_PAD = 100 // past the outermost card on each side
export const LANE_MIN_H = 80
export const LANE_MAX = 12
export const LANE_INK = '#64748b'

// What the API keeps of a lanes array: bounded, typed, nothing else.
export function cleanLanes(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  for (const l of raw) {
    if (!l || typeof l !== 'object' || out.length >= LANE_MAX) continue
    const id = typeof l.id === 'string' && /^[\w-]{1,40}$/.test(l.id) ? l.id : null
    if (!id || out.some(o => o.id === id) || !Number.isFinite(l.y) || !Number.isFinite(l.h)) continue
    const lane = { id, title: String(l.title ?? '').trim().slice(0, 40), y: Math.round(l.y), h: Math.max(LANE_MIN_H, Math.round(l.h)) }
    if (typeof l.color === 'string' && /^#[0-9a-f]{6}$/i.test(l.color)) lane.color = l.color
    out.push(lane)
  }
  return out
}

// The horizontal reach shared by every lane: the cards' extent plus padding.
export function laneSpan(rects) {
  if (!rects.length) return { x: -LANE_PAD, w: 2 * LANE_PAD }
  const minX = Math.min(...rects.map(r => r.x)), maxX = Math.max(...rects.map(r => r.x + r.w))
  return { x: minX - LANE_PAD, w: maxX - minX + 2 * LANE_PAD }
}
