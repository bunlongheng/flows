// Swimlanes: bands the cards sit in, 1 per layer of the system (VISITOR,
// APPS, RELAY, INBOX). Optional, per diagram, configuration only: saved in
// view_state.lanes over the API (PATCH view_state { lanes }) or the MCP
// (update_flow lanes), never edited on the canvas. A lane is a row
// { id, title, y, h, color?, size? } for a top-down layout or a column
// { id, title, x, w, color?, size? } for a left-to-right one; size is the
// title in px (default LANE_TITLE); a diagram has 1 kind,
// the kind of its first lane. A lane spans the whole diagram on its other
// axis, so cards fit by where they stand. The canvas and every export draw
// lanes from this 1 file so they match.

export const LANE_PAD = 100 // past the outermost card on each side
export const LANE_MIN = 80 // the thinnest lane
export const LANE_GAP = 40 // the 1 gap between lanes, always the same
export const LANE_MAX = 12
export const LANE_FIT = 36 // past the last card (and its note) inside a lane
export const LANE_INK = '#64748b'
export const LANE_TITLE = 13 // title size in px unless the lane says otherwise
export const LANE_TITLE_MIN = 10
export const LANE_TITLE_MAX = 40

// An edge end may name a lane instead of a card: "lane:<id>". The line stops on
// the lane's border and reads as 1 line to every card inside it. On the canvas
// the lane is the React Flow node laneNodeId(id); the API and exports keep the
// "lane:" form.
export const laneRef = id => (typeof id === 'string' && id.startsWith('lane:') ? id.slice(5) : null)
export const laneNodeId = id => `__lane_${id}`
export const isLaneNode = id => typeof id === 'string' && id.startsWith('__lane_')

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
    if (Number.isFinite(l.size)) lane.size = Math.min(LANE_TITLE_MAX, Math.max(LANE_TITLE_MIN, Math.round(l.size)))
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

// Where each lane is drawn: { id, title, color, size, x, y, w, h } in canvas units.
// A lane's thickness follows its cards: the band ends LANE_FIT past the last
// card inside it, note included while notes are shown, so hiding the notes
// tightens every band and showing them opens it back up. The configured h (or
// w) says which band a card starts in and holds for an empty lane; a band
// never grows across the next one.
export function fitLanes(lanes, rects) {
  const [at, size] = laneAxis(lanes) === 'col' ? ['x', 'w'] : ['y', 'h']
  const starts = lanes.map(l => l[at]).sort((a, b) => a - b)
  return lanes.map(l => {
    const inside = rects.filter(r => r[at] >= l[at] && r[at] < l[at] + l[size])
    if (!inside.length) return l
    const end = Math.max(...inside.map(r => r[at] + r[size])) + LANE_FIT
    const next = starts.find(s => s > l[at])
    const cap = next === undefined ? Infinity : next - LANE_GAP - l[at]
    return { ...l, [size]: Math.max(LANE_MIN, Math.min(cap, end - l[at])) }
  })
}

export function laneRects(lanes, rects) {
  const span = laneSpan(rects, laneAxis(lanes))
  return fitLanes(lanes, rects).map(l => ({ id: l.id, title: l.title, color: l.color, size: l.size, ...('x' in l ? { x: l.x, w: l.w } : { y: l.y, h: l.h }), ...span }))
}

// The React Flow nodes that draw the lanes: 1 per lane, under the cards,
// never selectable or draggable.
export function laneNodes(lanes, rects) {
  return laneRects(lanes, rects).map(r => ({
    id: laneNodeId(r.id), type: 'lane', position: { x: r.x, y: r.y }, width: r.w, height: r.h, measured: { width: r.w, height: r.h },
    zIndex: -1, selectable: false, draggable: false,
    data: { title: r.title, color: r.color, size: r.size },
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

// Lanes stored to fit their content: the SAME pad above the first card
// and below the last (and its note), so a band never crowds its title and every
// band is padded alike, each next band LANE_GAP after the one before, and the
// cards inside a band move with it. fitLanes tightens a band on the canvas when
// the notes are hidden, but it may never grow one past the next band's start -
// so the room a note needs has to be in the stored lane. Returns the lanes and,
// by card id, how far that card moves. Running it twice changes nothing.
export function spaceLanes(lanes, rects, pad = LANE_FIT) {
  const [at, size] = laneAxis(lanes) === 'col' ? ['x', 'w'] : ['y', 'h']
  const sorted = [...lanes].sort((a, b) => a[at] - b[at])
  const shift = new Map()
  let pos = sorted[0]?.[at] ?? 0
  const out = sorted.map(l => {
    const inside = rects.filter(r => r[at] >= l[at] && r[at] < l[at] + l[size])
    // The cards move so the first one sits `pad` inside the band, wherever
    // the author happened to start them, and the band ends LANE_FIT past the
    // last. Both pads are the same number on every lane of every diagram.
    const d = inside.length ? pos + pad - Math.min(...inside.map(r => r[at])) : 0
    const end = inside.length ? Math.max(...inside.map(r => r[at] + r[size])) + d + pad - pos : l[size]
    const span = Math.max(LANE_MIN, Math.round(end))
    if (d) for (const r of inside) shift.set(r.id, d)
    const lane = { ...l, [at]: pos, [size]: span }
    pos += span + LANE_GAP
    return lane
  })
  return { lanes: out, shift }
}
