// Swimlanes: bands the cards sit in, 1 per layer of the system (VISITOR,
// APPS, RELAY, INBOX). Optional, per diagram, configuration only: saved in
// view_state.lanes over the API (PATCH view_state { lanes }) or the MCP
// (update_flow lanes), never edited on the canvas. A lane is a row
// { id, title, y, h, color? } for a top-down layout or a column
// { id, title, x, w, color? } for a left-to-right one; a diagram has 1 kind,
// the kind of its first lane. A lane spans the whole diagram on its other
// axis, so cards fit by where they stand. The canvas and every export draw
// lanes from this 1 file so they match.

export const LANE_PAD = 100 // past the outermost card on each side
export const LANE_MIN = 80 // the thinnest lane
export const LANE_GAP = 40 // the 1 gap between lanes, always the same
export const LANE_MAX = 12
export const LANE_INK = '#64748b'

// 'row' lanes stack by y and h; 'col' lanes stand side by side by x and w.
export const laneAxis = lanes => (lanes[0] && 'x' in lanes[0] ? 'col' : 'row')

// What the API keeps of a lanes array: bounded, typed, 1 axis, nothing else.
export function cleanLanes(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  let axis = null
  for (const l of raw) {
    if (!l || typeof l !== 'object' || out.length >= LANE_MAX) continue
    const id = typeof l.id === 'string' && /^[\w-]{1,40}$/.test(l.id) ? l.id : null
    if (!id || out.some(o => o.id === id)) continue
    const kind = Number.isFinite(l.x) && Number.isFinite(l.w) ? 'col' : Number.isFinite(l.y) && Number.isFinite(l.h) ? 'row' : null
    if (!kind || (axis && kind !== axis)) continue
    axis = kind
    const lane = { id, title: String(l.title ?? '').trim().slice(0, 40) }
    if (kind === 'col') { lane.x = Math.round(l.x); lane.w = Math.max(LANE_MIN, Math.round(l.w)) }
    else { lane.y = Math.round(l.y); lane.h = Math.max(LANE_MIN, Math.round(l.h)) }
    if (typeof l.color === 'string' && /^#[0-9a-f]{6}$/i.test(l.color)) lane.color = l.color
    out.push(lane)
  }
  return packLanes(out)
}

// Lanes are a stack along their axis: the first where it was configured, each
// next one LANE_GAP after the one before, so the gaps are always equal
// whatever positions come in.
export function packLanes(lanes) {
  const [at, size] = laneAxis(lanes) === 'col' ? ['x', 'w'] : ['y', 'h']
  const sorted = [...lanes].sort((a, b) => a[at] - b[at])
  let pos = sorted[0]?.[at] ?? 0
  return sorted.map(l => { const out = { ...l, [at]: pos }; pos += l[size] + LANE_GAP; return out })
}

// The reach shared by every lane on its other axis: the cards' extent plus padding.
export function laneSpan(rects, axis = 'row') {
  const [at, size] = axis === 'col' ? ['y', 'h'] : ['x', 'w']
  if (!rects.length) return { [at]: -LANE_PAD, [size]: 2 * LANE_PAD }
  const lo = Math.min(...rects.map(r => r[at])), hi = Math.max(...rects.map(r => r[at] + r[size]))
  return { [at]: lo - LANE_PAD, [size]: hi - lo + 2 * LANE_PAD }
}

// Where each lane is drawn: { id, title, color, x, y, w, h } in canvas units.
export function laneRects(lanes, rects) {
  const span = laneSpan(rects, laneAxis(lanes))
  return lanes.map(l => ({ id: l.id, title: l.title, color: l.color, ...('x' in l ? { x: l.x, w: l.w } : { y: l.y, h: l.h }), ...span }))
}

// The React Flow nodes that draw the lanes: 1 per lane, under the cards,
// never selectable or draggable.
export function laneNodes(lanes, rects) {
  return laneRects(lanes, rects).map(r => ({
    id: `__lane_${r.id}`, type: 'lane', position: { x: r.x, y: r.y }, width: r.w, height: r.h, measured: { width: r.w, height: r.h },
    zIndex: -1, selectable: false, draggable: false,
    data: { title: r.title, color: r.color },
  }))
}

// The clear strips between lanes, where a trunk's bus line can run without
// crossing a lane: the axis the lanes are packed on and the centre of each gap.
export function laneGaps(rects) {
  if (rects.length < 2) return null
  const axis = rects.every(r => r.y === rects[0].y) ? 'x' : 'y'
  const len = axis === 'x' ? 'w' : 'h'
  const sorted = [...rects].sort((a, b) => a[axis] - b[axis])
  const mids = []
  for (let i = 1; i < sorted.length; i++) {
    const lo = sorted[i - 1][axis] + sorted[i - 1][len], hi = sorted[i][axis]
    if (hi > lo) mids.push((lo + hi) / 2)
  }
  return { axis, mids }
}
