// Where a line goes. This is the canvas's own routing, and it is the ONLY
// routing: GradientEdge draws from it on the canvas, and lib/render-svg.js
// draws from it for every export (SVG, GIF, share card, gallery tile). One
// module, so the picture an agent fetches by URL is the picture the owner
// approved on the canvas - same faces, same elbows, same bends, same badges.
//
// Nothing in here touches the DOM or React. A node arrives in React Flow's
// internal shape ({ measured: { width, height }, internals: { positionAbsolute:
// { x, y } } }) because that is what the canvas has; the server builds the same
// shape from a stored node's position and size.
import { Position, getSmoothStepPath, getBezierPath } from '@xyflow/system'
import { tagText } from './tag.js'

// ─── Edge geometry ────────────────────────────────────────────────────────────
// Edges attach to a face of the box, spread evenly across it and centered: one
// edge lands dead center, two sit symmetrically either side of center, three or
// more keep the same even spacing. Which face is chosen per edge, from the
// direction of the partner, so things to the right attach on the right and
// things below attach on the bottom.
//
// Spread points beat one shared anchor: five lines converging on a single spot
// is a knot, and it also piles every step marker on top of the same pixel.

// A pair of boxes on the same axis gets a straight connector - lining them up was
// deliberate and the diagram should show it. "On the same axis" is proportional:
// the off-axis drift has to be within 5% of how far apart they are, so a long run
// tolerates a few pixels of slop while two boxes close together have to be
// genuinely square. ALIGN_TOL is the floor, so an exactly snapped pair reads
// straight even when they nearly touch.
const ALIGN_TOL = 8
const ALIGN_RATIO = 0.05
const MAX_GAP = 44 // widest spacing between neighbouring attach points on a face
const PAIR_GAP = 36 // lane spacing for edges that share the same two boxes
// A spread slot on one face meeting a centred slot on the other leaves a jog of
// a few pixels that the label then sits on and hides. Ends this close are pulled
// onto one line instead - a near-straight line has to be exactly straight.
// Wide enough for a spread slot at BOTH ends (2 x 22) plus the centre slop.
const SNAP_TOL = 48

const onAxis = (drift, span) => drift <= ALIGN_TOL || drift <= span * ALIGN_RATIO

export const centerOf = n => ({
  x: n.internals.positionAbsolute.x + n.measured.width / 2,
  y: n.internals.positionAbsolute.y + n.measured.height / 2,
})

// A lane end ("lane:<id>"): the line meets the lane's border straight on from
// its far end, so every lane line drops (or runs) from under its own source
// and never crowds the band's middle. A row lane is crossed top to bottom, so
// its faces are top and bottom; a column lane is crossed left to right, so
// left and right.
//
// The lane says which it is (src/lanes.js laneAxis: 'row' or 'col', stamped on
// the node by laneNodes and by lib/render-svg.js). Guessing it from the rect is
// the fallback only, and it was wrong whenever the shape disagreed with the
// axis: a column lane holding 5 columns of cards and 3 rows is WIDER than tall,
// so w >= h called it a row and the line hooked up over the band's top edge
// instead of running straight into its side.
const isLane = n => n?.lane === true || n?.type === 'lane'
const laneAxisOf = n => n?.axis || n?.data?.axis || null
const clampTo = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
function laneFace(node, fc) {
  const p = node.internals.positionAbsolute, w = node.measured.width, h = node.measured.height
  const c = { x: p.x + w / 2, y: p.y + h / 2 }
  const ax = laneAxisOf(node)
  if (ax ? ax === 'row' : w >= h) {
    const side = fc.y < c.y ? Position.Top : Position.Bottom
    return { x: clampTo(fc.x, p.x + EDGE_MARGIN, p.x + w - EDGE_MARGIN), y: side === Position.Top ? p.y : p.y + h, side, alone: true, gap: 0, half: w / 2, mid: c.x }
  }
  const side = fc.x < c.x ? Position.Left : Position.Right
  return { x: side === Position.Left ? p.x : p.x + w, y: clampTo(fc.y, p.y + EDGE_MARGIN, p.y + h - EDGE_MARGIN), side, alone: true, gap: 0, half: h / 2, mid: c.y }
}
// Where a far node sits as seen from `c`: a lane counts as the point on its
// border straight across from c, so the card attaches on the face that looks
// at the lane, not at the lane's distant centre.
const farCenter = (far, c) => (isLane(far) ? (({ x, y }) => ({ x, y }))(laneFace(far, c)) : centerOf(far))

// Which face of `from` faces `to` - the dominant axis between their centers.
function sideFor(from, to) {
  const dx = to.x - from.x, dy = to.y - from.y
  return Math.abs(dx) >= Math.abs(dy)
    ? (dx >= 0 ? Position.Right : Position.Left)
    : (dy >= 0 ? Position.Bottom : Position.Top)
}

// Where THIS edge attaches to `node`, given everything else sharing that face.
// Peers are ordered by where their far end sits along the face, so neighbouring
// lines never cross on their way in.
function attachPoint(node, nodeId, otherNode, edgeId, edges, nodeOf) {
  const c = centerOf(node)
  if (isLane(node)) return laneFace(node, centerOf(otherNode))
  const side = sideFor(c, farCenter(otherNode, c))
  const horizontal = side === Position.Left || side === Position.Right

  const peers = []
  for (const e of edges) {
    const farId = e.source === nodeId ? e.target : e.target === nodeId ? e.source : null
    if (!farId || farId === nodeId) continue
    const far = nodeOf(farId)
    if (!far?.measured?.width) continue
    const fc = farCenter(far, c)
    if (sideFor(c, fc) !== side) continue
    peers.push({ id: e.id, along: horizontal ? fc.y : fc.x })
  }
  peers.sort((a, b) => a.along - b.along || (a.id < b.id ? -1 : 1))

  const n = Math.max(1, peers.length)
  const idx = Math.max(0, peers.findIndex(p => p.id === edgeId))
  const face = horizontal ? node.measured.height : node.measured.width
  const gap = Math.min(face / (n + 1), MAX_GAP)
  const offset = (idx - (n - 1) / 2) * gap // 1 edge -> 0, dead center

  const w2 = node.measured.width / 2, h2 = node.measured.height / 2
  // mid/half/gap describe the face, so a caller can slide this slot along it
  // without leaving the box or stepping into a neighbour's slot.
  const at = { side, alone: n === 1, gap, half: face / 2, mid: horizontal ? c.y : c.x }
  if (side === Position.Right) return { x: c.x + w2, y: c.y + offset, ...at }
  if (side === Position.Left) return { x: c.x - w2, y: c.y + offset, ...at }
  // The bottom face is the card's edge, note or no note. The note hangs below
  // it and the line runs on to the card underneath the note: the owner wants a
  // connector to touch the box it joins, and a line that stops at the note's
  // foot read as one that never arrived. The note paints over the line, which
  // is fine - the card is what the line is for.
  if (side === Position.Bottom) return { x: c.x + offset, y: c.y + h2, ...at }
  return { x: c.x + offset, y: c.y - h2, ...at }
}

// Where a DETOURING edge meets a face. A face's natural occupants are the edges
// whose partner actually lies that way; attachPoint spreads them across the
// middle. An edge that only arrives here because its direct route was blocked
// does not belong to that band - parking it on the face centre is how two lines
// ended up on the exact same pixel, and two lines on one pixel cannot be told
// apart.
//
// So a detour parks OUTSIDE the natural band, alternating sides and working
// outwards. The rank is taken over every edge that COULD detour onto this face,
// not the ones that happened to, so a slot does not move when an unrelated
// route elsewhere becomes clear.
const EDGE_MARGIN = 10 // a slot never lands on the corner of the face

function detourSlot(node, nodeId, side, edgeId, edges, nodeOf) {
  const c = centerOf(node)
  const horizontal = side === Position.Left || side === Position.Right
  const face = horizontal ? node.measured.height : node.measured.width
  const mid = horizontal ? c.y : c.x
  const natural = [], outer = []
  for (const e of edges) {
    const farId = e.source === nodeId ? e.target : e.target === nodeId ? e.source : null
    if (!farId || farId === nodeId) continue
    const far = nodeOf(farId)
    if (!far?.measured?.width) continue
    const fc = centerOf(far)
    const along = horizontal ? fc.y : fc.x
    ;(sideFor(c, fc) === side ? natural : outer).push({ id: e.id, along })
  }
  const n = Math.max(1, natural.length)
  const gap = Math.min(face / (n + 1), MAX_GAP)
  // A detouring edge can still BELONG to the face it comes back to: the direct
  // line was blocked, it went the long way round, and it arrives from the
  // natural direction anyway. That one keeps its natural slot, which for the
  // only line on a face is dead center (owner 2026-10-09: "if 1 line going in
  // pls going in center not off center" - a lone line was landing 38 px low on
  // a 130 px card). Parking outside the band is for an edge with no claim to
  // the face; the 2 sets are disjoint, so neither can take the other's slot.
  natural.sort((a, b) => a.along - b.along || (a.id < b.id ? -1 : 1))
  const own = natural.findIndex(o => o.id === edgeId)
  if (own >= 0) return { at: mid + (own - (n - 1) / 2) * gap, rank: 0 }
  const inner = ((n - 1) / 2) * gap + gap / 2 // clear of the outermost natural slot
  outer.sort((a, b) => a.along - b.along || (a.id < b.id ? -1 : 1))
  const rank = Math.max(0, outer.findIndex(o => o.id === edgeId))
  // Rank -> (which side, how far out) is one-to-one, so no two detours on this
  // face can resolve to the same offset.
  const room = Math.max(gap / 2, face / 2 - EDGE_MARGIN - inner)
  const perSide = Math.max(1, Math.ceil(outer.length / 2))
  const at = mid + (rank % 2 ? -1 : 1) * (inner + (room / perSide) * (Math.floor(rank / 2) + 0.5))
  // The rank rides along: two edges converging on one face need two lanes as
  // well as two slots, or they arrive apart and travel on top of each other.
  return { at, rank }
}

// Can this slot move from `from` to `to` along its face? It must stay inside the
// box, and a shared face must not let it cross into the neighbouring slot.
//
// A LONE slot does not move at all. It is the middle of its face, and the only
// line on a face enters dead centre (owner 2026-10-09: "if 1 line going in pls
// going in center not off center"). It used to be the most movable slot of the
// two - nothing to collide with, so straightening dragged it up to half a card
// off its middle, and a single line met a card near its corner.
const canSlide = (p, from, to) => {
  const d = Math.abs(to - from)
  if (d === 0) return true
  if (p.alone) return false
  if (Math.abs(to - p.mid) > p.half - 10) return false
  return d <= p.gap / 2 - 2
}

// One coordinate both ends can share: keep a lone (centred) end where it is and
// move the spread one, else meet in the middle. Nothing when neither can give -
// 2 centred ends that do not line up take a small elbow, which is the honest
// picture of 2 cards that are not level.
function snapLine(a, av, b, bv) {
  const mid = (av + bv) / 2
  const order = a.alone && !b.alone ? [av, mid, bv] : b.alone && !a.alone ? [bv, mid, av] : [mid, av, bv]
  return order.find(v => canSlide(a, av, v) && canSlide(b, bv, v))
}


// ─── Obstacle-aware routing ───────────────────────────────────────────────────
// Aligning nodes onto shared rows makes most connectors straight, but it also
// means a long run can pass clean THROUGH the boxes sitting between its two
// ends. So the route is built as a polyline, every segment is tested against
// the other nodes, and when one is blocked the middle of the route slides to a
// lane that is clear.
const LANE = 26        // clearance kept between a routed line and a box
const HIT_PAD = 4      // a line grazing a border is not a crossing

const blocks = (x1, y1, x2, y2, rects) => rects.some(r => {
  const rx1 = r.x - HIT_PAD, ry1 = r.y - HIT_PAD
  const rx2 = r.x + r.w + HIT_PAD, ry2 = r.y + r.h + HIT_PAD
  if (y1 === y2) return y1 > ry1 && y1 < ry2 && Math.max(x1, x2) > rx1 && Math.min(x1, x2) < rx2
  if (x1 === x2) return x1 > rx1 && x1 < rx2 && Math.max(y1, y2) > ry1 && Math.min(y1, y2) < ry2
  // diagonal (only the straight-run case) - sample it
  for (let t = 0; t <= 1; t += 0.02) {
    const x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t
    if (x > rx1 && x < rx2 && y > ry1 && y < ry2) return true
  }
  return false
})

// The edge's own two boxes, pulled in far enough that a leg leaving the border
// does not count, but a leg cutting through the middle does. Without this a
// route could turn a corner INSIDE the box it just left - every crossing left on
// the final diagram was an edge crossing its own source or target.
const OWN_SHRINK = 12
const shrink = r => ({ x: r.x + OWN_SHRINK, y: r.y + OWN_SHRINK, w: r.w - 2 * OWN_SHRINK, h: r.h - 2 * OWN_SHRINK })

const clearPolyline = (pts, rects) => {
  for (let i = 1; i < pts.length; i++) {
    if (blocks(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y, rects)) return false
  }
  return true
}

// Lines never lie on top of each other. Every straight leg of a routed line,
// stubs included, is reserved in `taken`, and a later line whose leg would run
// within TRACK_SEP of a reserved one, alongside it, takes another lane instead.
// Trunks share their stem on purpose and route elsewhere, reserving nothing.
const TRACK_SEP = 14
export function routeLegs(pts) {
  const out = []
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i]
    if (a.y === b.y && a.x !== b.x) out.push({ h: true, c: a.y, lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x) })
    else if (a.x === b.x && a.y !== b.y) out.push({ h: false, c: a.x, lo: Math.min(a.y, b.y), hi: Math.max(a.y, b.y) })
  }
  return out
}
// The straight legs of a drawn path string, for routes that never were a polyline
// (a trunk, a straight run, a plain elbow). Rounded corners are skipped.
function pathLegs(d) {
  const pts = []
  for (const m of d.matchAll(/([MLQC])([^MLQC]+)/g)) {
    const n = m[2].match(/-?[\d.]+/g).map(Number)
    if (m[1] !== 'L') pts.push(null)
    pts.push({ x: n[n.length - 2], y: n[n.length - 1] })
  }
  const out = []
  for (let i = 1; i < pts.length; i++) if (pts[i - 1] && pts[i]) out.push(...routeLegs([pts[i - 1], pts[i]]))
  return out
}
// `g` is the line's group: the members of 1 trunk share theirs on purpose.
const onTaken = (pts, taken, g) => taken.length > 0 && routeLegs(pts).some(l => taken.some(t => t.g !== g &&
  t.h === l.h && Math.abs(t.c - l.c) < TRACK_SEP && Math.min(t.hi, l.hi) - Math.max(t.lo, l.lo) > TRACK_SEP))

// Lanes to try for the middle of the route: the natural midpoint first, then
// just clear of each box's edges, nearest first.
//
// `own` is the edge's own two boxes. They are not obstacles - the route starts
// and ends on their borders - but the MIDDLE of the route must still not sit
// inside them, or the line doubles back and crosses the box it just left. That
// is invisible to the obstacle test, which excludes both endpoints by design.
const lanes = (mid, rects, axis, own = [], stagger = false) => {
  const out = [mid]
  // With tracks reserved, tracks just beside the middle give a line somewhere
  // close to go when the middle is taken.
  if (stagger) for (let k = 1; k <= 8; k++) out.push(mid - k * TRACK_SEP * 1.5, mid + k * TRACK_SEP * 1.5)
  for (const r of rects) {
    if (axis === 'x') { out.push(r.x - LANE, r.x + r.w + LANE) }
    else { out.push(r.y - LANE, r.y + r.h + LANE) }
  }
  // Two rails outside everything. A route boxed in on all sides still has these
  // to escape along, which is what stops the last few edges falling back to a
  // path that cuts through a node.
  if (rects.length) {
    if (axis === 'x') {
      out.push(Math.min(...rects.map(r => r.x)) - 2 * LANE,
               Math.max(...rects.map(r => r.x + r.w)) + 2 * LANE)
    } else {
      out.push(Math.min(...rects.map(r => r.y)) - 2 * LANE,
               Math.max(...rects.map(r => r.y + r.h)) + 2 * LANE)
    }
  }
  const insideOwn = c => own.some(r => axis === 'x'
    ? c > r.x - HIT_PAD && c < r.x + r.w + HIT_PAD
    : c > r.y - HIT_PAD && c < r.y + r.h + HIT_PAD)
  return [...new Set(out)]
    .filter(c => !insideOwn(c))
    .sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid))
}

// When two boxes share a row, no choice of middle helps - the whole run lives on
// that row and passes through whatever sits between them. The way out is to
// leave through the TOP or BOTTOM face instead and travel in a clear lane above
// or below the row. Mirrored for two boxes sharing a column.
function detour(sRect, tRect, rects, vertical, slotS, slotT, taken = []) {
  // The nearest clear lane is the right answer for ONE edge. When several
  // detour to the same face they all pick it, arrive at their own slots, and
  // then run the whole way down the same line - which is the overlap this is
  // here to stop. So an edge skips as many clear lanes as its rank on the
  // busier of its two faces, and lands in a lane of its own. Rank 0 still gets
  // the nearest one, so a lone detour is unchanged.
  let fallback = null
  for (const before of [true, false]) {
    const side = vertical
      ? (before ? Position.Left : Position.Right)
      : (before ? Position.Top : Position.Bottom)
    const ps = slotS(side), pt = slotT(side)
    const s = vertical
      ? { x: before ? sRect.x : sRect.x + sRect.w, y: ps.at }
      : { x: ps.at, y: before ? sRect.y : sRect.y + sRect.h }
    const t = vertical
      ? { x: before ? tRect.x : tRect.x + tRect.w, y: pt.at }
      : { x: pt.at, y: before ? tRect.y : tRect.y + tRect.h }
    const mid = vertical ? (s.x + t.x) / 2 : (s.y + t.y) / 2
    let skip = Math.max(ps.rank, pt.rank)
    for (const c of lanes(mid, rects, vertical ? 'x' : 'y', [sRect, tRect], taken.length > 0)) {
      const pts = vertical
        ? [s, { x: c, y: s.y }, { x: c, y: t.y }, t]
        : [s, { x: s.x, y: c }, { x: t.x, y: c }, t]
      if (!clearPolyline(pts, rects) || onTaken(pts, taken)) continue
      // Every clear lane is a valid route, so the last one seen is the answer
      // if this edge's rank runs past the end of the list.
      fallback = pts
      if (skip-- <= 0) return pts
    }
  }
  return fallback
}

// Orthogonal points for a pair of faces, with the middle placed at `c`.
function routePoints(s, t, sHoriz, tHoriz, c) {
  if (sHoriz && tHoriz) return [s, { x: c, y: s.y }, { x: c, y: t.y }, t]
  if (!sHoriz && !tHoriz) return [s, { x: s.x, y: c }, { x: t.x, y: c }, t]
  if (sHoriz) return [s, { x: t.x, y: s.y }, t]
  return [s, { x: s.x, y: t.y }, t]
}

// Rounded corners, drawn by pulling back from each bend.
function roundedPath(pts, r = 16) {
  if (pts.length < 3) return `M${pts[0].x},${pts[0].y} L${pts[pts.length - 1].x},${pts[pts.length - 1].y}`
  let d = `M${pts[0].x},${pts[0].y}`
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], cpt = pts[i + 1]
    const r1 = Math.min(r, Math.hypot(b.x - a.x, b.y - a.y) / 2)
    const r2 = Math.min(r, Math.hypot(cpt.x - b.x, cpt.y - b.y) / 2)
    const rr = Math.min(r1, r2)
    const inX = b.x + (a.x - b.x === 0 ? 0 : Math.sign(a.x - b.x) * rr)
    const inY = b.y + (a.y - b.y === 0 ? 0 : Math.sign(a.y - b.y) * rr)
    const outX = b.x + (cpt.x - b.x === 0 ? 0 : Math.sign(cpt.x - b.x) * rr)
    const outY = b.y + (cpt.y - b.y === 0 ? 0 : Math.sign(cpt.y - b.y) * rr)
    d += ` L${inX},${inY} Q${b.x},${b.y} ${outX},${outY}`
  }
  const last = pts[pts.length - 1]
  d += ` L${last.x},${last.y}`
  return d
}

// A badge is kept off the very ends of its edge: t=0 and t=1 sit under the two
// service boxes, where the badge is hidden and unclickable.
export const T_MIN = 0.12, T_MAX = 0.88

const SIDE_OF = { top: Position.Top, right: Position.Right, bottom: Position.Bottom, left: Position.Left }
const END_MIN = 0.05, END_MAX = 0.95

const BEND_T = [0.1, 0.9], BEND_D = 600

// The straight run S->T as a unit vector and its length. A bend is kept in
// this frame so it follows the boxes when they move.
const bendFrame = (sx, sy, tx, ty) => {
  const dx = tx - sx, dy = ty - sy, len = Math.hypot(dx, dy) || 1
  return { ux: dx / len, uy: dy / len, len }
}
export function bendPoint(sx, sy, tx, ty, b) {
  const { ux, uy, len } = bendFrame(sx, sy, tx, ty)
  return { x: sx + ux * len * b.t - uy * b.d, y: sy + uy * len * b.t + ux * b.d }
}
// The bend that puts the bend point under a dragged (px, py).
export function bendFor(sx, sy, tx, ty, px, py) {
  const { ux, uy, len } = bendFrame(sx, sy, tx, ty)
  const rx = px - sx, ry = py - sy
  const t = Math.min(BEND_T[1], Math.max(BEND_T[0], (rx * ux + ry * uy) / len))
  const d = Math.min(BEND_D, Math.max(-BEND_D, -rx * uy + ry * ux))
  return { t: Number(t.toFixed(4)), d: Number(d.toFixed(1)) }
}

// Where a pinned end sits: `end.at` is a 0..1 fraction along the chosen face.
// Shaped like an attachPoint result so the callers do not care which it was.
function pinnedPoint(node, end) {
  const { x, y } = node.internals.positionAbsolute
  const w = node.measured.width, h = node.measured.height
  const at = Math.min(END_MAX, Math.max(END_MIN, end.at))
  const side = SIDE_OF[end.side] || Position.Right
  const horizontal = side === Position.Left || side === Position.Right
  const p = horizontal
    ? { x: side === Position.Left ? x : x + w, y: y + h * at }
    : { x: x + w * at, y: side === Position.Top ? y : y + h }
  return { ...p, side, alone: true, gap: 0, half: (horizontal ? h : w) / 2, mid: horizontal ? y + h / 2 : x + w / 2 }
}

// The face of `node` closest to a dragged point, and how far along it.
export function nearestEnd(node, px, py) {
  const { x, y } = node.internals.positionAbsolute
  const w = node.measured.width, h = node.measured.height
  const fx = Math.min(END_MAX, Math.max(END_MIN, (px - x) / w))
  const fy = Math.min(END_MAX, Math.max(END_MIN, (py - y) / h))
  const cands = [
    { side: 'top', at: fx, d: Math.abs(py - y) },
    { side: 'bottom', at: fx, d: Math.abs(py - (y + h)) },
    { side: 'left', at: fy, d: Math.abs(px - x) },
    { side: 'right', at: fy, d: Math.abs(px - (x + w)) },
  ]
  const best = cands.sort((a, b) => a.d - b.d)[0]
  return { side: best.side, at: Number(best.at.toFixed(4)) }
}

// ─── The route ────────────────────────────────────────────────────────────────
// One edge's line and where its badge goes, from the same inputs the canvas
// has. `nodeOf(id)` returns a node in the internal shape (or null while it is
// unmeasured), `edges` is every edge on the diagram, `obstacles` every OTHER
// card's box with its note, and `nodeRects` every card's box (for the badge
// nudge). `bend`, `endS`, `endT` and `arrow` are the owner's saved picks.
// `fallback` is where React Flow put the ends before the nodes were measured.
// Several lines meeting ONE face with the SAME tag are one message, so they
// draw as one trunk. Into a card (end 't', fan-in): every member shares the
// target's slot and a bus line halfway there, the leader (lowest id) strokes
// the trunk and carries the badge, the rest stop where they meet the bus. Out
// of a card (end 's', fan-out) it is the mirror: 1 trunk leaves the source,
// splits on the bus, and each member strokes its own run from the junction on.
// 5 apps posting to 1 relay read as 1 arrow with 1 "POST" on it, not 5 stacked
// badges. A hand bent, pinned or arrow-styled line never joins: the owner
// placed it.
function fanAt(end, nodeId, node, id, tag, side, edges, nodeOf) {
  if (!tag) return null
  const c = centerOf(node)
  const members = []
  for (const e of edges) {
    if ((end === 't' ? e.target : e.source) !== nodeId) continue
    const d = e.data || {}
    if (d.bend || d.ends?.s || d.ends?.t || d.style?.arrow) continue
    if (tagText(e.label, d.description) !== tag) continue
    const farId = end === 't' ? e.source : e.target
    const far = nodeOf(farId)
    if (!far?.measured?.width || sideFor(c, centerOf(far)) !== side) continue
    members.push({ id: e.id, far: farId })
  }
  if (members.length < 2 || !members.some(m => m.id === id)) return null
  members.sort((a, b) => (a.id < b.id ? -1 : 1))
  return { end, members, leader: members[0].id, ids: new Set(members.map(m => m.id)) }
}

// The trunk route for one member. `path` is the whole trip, for the dot;
// `drawPath` is what this member strokes: the leader strokes everything, a
// fan-in follower stops at the junction, a fan-out follower starts there. Null
// when a card sits on the way, and the member then routes on its own.
function trunkPath({ fan, id, sx, sy, tx, ty, side, node, edges, nodeOf, obstacles, gaps, taken = [], g }) {
  const vertical = side === Position.Top || side === Position.Bottom
  const into = fan.end === 't'
  // The far ends' slots, so the bus sits halfway between the shared face and them.
  const fars = fan.members.map(m => attachPoint(nodeOf(m.far), m.far, node, m.id, edges, nodeOf))
  const meanFar = fars.reduce((a, p) => a + (vertical ? p.y : p.x), 0) / fars.length
  const shared = into ? (vertical ? ty : tx) : (vertical ? sy : sx)
  let bus = (shared + meanFar) / 2
  // With swimlanes the bus moves into the gap between the 2 lanes it crosses,
  // so the line runs in the clear strip instead of through a lane.
  if (gaps && gaps.axis === (vertical ? 'y' : 'x')) {
    const lo = Math.min(shared, meanFar), hi = Math.max(shared, meanFar)
    const mid = gaps.mids.find(m => m > lo && m < hi)
    if (mid !== undefined) bus = mid
  }
  const S = { x: sx, y: sy }, T = { x: tx, y: ty }
  const at = b => vertical ? [{ x: sx, y: b }, { x: tx, y: b }] : [{ x: b, y: sy }, { x: b, y: ty }]
  // Another line already on this bus: step off it, 1 track at a time.
  for (const b of [0, 1, -1, 2, -2, 3, -3].map(k => bus + k * TRACK_SEP)) {
    const [cs, ct] = at(b)
    if (clearPolyline([S, cs, ct, T], obstacles) && !onTaken([S, cs, ct, T], taken, g)) { bus = b; break }
  }
  const [Cs, Ct] = at(bus) // where the source's and the target's stems meet the bus
  if (!clearPolyline([S, Cs, Ct, T], obstacles)) return null
  const straight = vertical ? sx === tx : sy === ty
  const leader = fan.leader === id
  let path, drawPath, labelX, labelYRaw
  if (into) {
    // Stem down to the bus and along it to the junction Ct, then the trunk.
    const stem = straight ? `M${S.x},${S.y} L${Ct.x},${Ct.y}` : roundedPath([S, Cs, Ct])
    path = `${stem} L${T.x},${T.y}`
    drawPath = leader ? path : stem
    labelX = vertical ? tx : (bus + tx) / 2; labelYRaw = vertical ? (bus + ty) / 2 : ty
  } else {
    // The trunk to the junction Cs, then along the bus and down the stem.
    const run = straight ? `M${Cs.x},${Cs.y} L${T.x},${T.y}` : roundedPath([Cs, Ct, T])
    path = `M${S.x},${S.y} L${Cs.x},${Cs.y} ${run.slice(1)}`
    drawPath = leader ? path : run
    labelX = vertical ? sx : (sx + bus) / 2; labelYRaw = vertical ? (sy + bus) / 2 : sy
  }
  return { path, drawPath, labelX, labelYRaw, hideArrow: into && !leader }
}

export function routeEdge({ taken = [], id, source, target, sourceNode, targetNode, nodeOf, edges, obstacles, nodeRects, gaps = null, bend, endS, endT, arrow, label, description, fallback = {} }) {
  let sx = fallback.sx ?? 0, sy = fallback.sy ?? 0, tx = fallback.tx ?? 0, ty = fallback.ty ?? 0
  let sSide = Position.Right, tSide = Position.Left
  let aligned = false
  let sp2 = null, tp2 = null
  let fan = null
  const measured = sourceNode?.measured?.width && targetNode?.measured?.width
  if (measured) {
    sp2 = attachPoint(sourceNode, source, targetNode, id, edges, nodeOf)
    tp2 = attachPoint(targetNode, target, sourceNode, id, edges, nodeOf)
    sx = sp2.x; sy = sp2.y; sSide = sp2.side
    tx = tp2.x; ty = tp2.y; tSide = tp2.side
    if (endS) { const p = pinnedPoint(sourceNode, endS); sx = p.x; sy = p.y; sSide = p.side }
    if (endT) { const p = pinnedPoint(targetNode, endT); tx = p.x; ty = p.y; tSide = p.side }
    // A trunk member takes the slot its leader gets when the other members are
    // not counted, so all of them meet the target at the one point.
    if (!bend && !endS && !endT && !arrow) {
      const tag = tagText(label, description)
      fan = fanAt('t', target, targetNode, id, tag, tSide, edges, nodeOf) || fanAt('s', source, sourceNode, id, tag, sSide, edges, nodeOf)
      if (fan) {
        const kept = edges.filter(e => e.id === fan.leader || !fan.ids.has(e.id))
        const lead = fan.members[0]
        if (fan.end === 't') {
          tp2 = attachPoint(targetNode, target, nodeOf(lead.far), lead.id, kept, nodeOf)
          tx = tp2.x; ty = tp2.y; tSide = tp2.side
        } else {
          sp2 = attachPoint(sourceNode, source, nodeOf(lead.far), lead.id, kept, nodeOf)
          sx = sp2.x; sy = sp2.y; sSide = sp2.side
        }
      }
    }

    // Straight run for a pair that lines up - but only when neither face is
    // sharing slots, otherwise forcing this one to center would collide with a
    // neighbour's slot. A pinned end is where the owner put it, so it never
    // gets snapped back onto an auto-computed line.
    //
    // Both ends being lone used to meet at the midpoint of the 2 centres, which
    // pulled BOTH off their middles when the cards were not level - 2 cards of
    // different heights on one row have centres up to 25 px apart. A lone end
    // stays centred, so the pair draws straight when their centres agree and
    // takes the elbow when they do not.
    if (!fan && !endS && !endT && sp2.alone && tp2.alone) {
      const sc = centerOf(sourceNode), tc = centerOf(targetNode)
      const driftY = Math.abs(sc.y - tc.y), driftX = Math.abs(sc.x - tc.x)
      if (driftX >= driftY && onAxis(driftY, driftX)) {
        if (sy === ty) aligned = true
      } else if (onAxis(driftX, driftY)) {
        if (sx === tx) aligned = true
      }
    }
    // Slots that nearly line up get pulled onto one line. Same proportional
    // rule as the centre test, with a floor wide enough to cover a spread slot.
    if (!fan && !aligned && !endS && !endT) {
      const sH = sSide === Position.Left || sSide === Position.Right
      const tH = tSide === Position.Left || tSide === Position.Right
      if (sH && tH && sy !== ty && (Math.abs(ty - sy) <= SNAP_TOL || Math.abs(ty - sy) <= Math.abs(tx - sx) * ALIGN_RATIO)) {
        const y = snapLine(sp2, sy, tp2, ty)
        if (y != null) { sy = y; ty = y; aligned = true }
      } else if (!sH && !tH && sx !== tx && (Math.abs(tx - sx) <= SNAP_TOL || Math.abs(tx - sx) <= Math.abs(ty - sy) * ALIGN_RATIO)) {
        const x = snapLine(sp2, sx, tp2, tx)
        if (x != null) { sx = x; tx = x; aligned = true }
      }
    }
  }

  // Parallel edges between the same node pair (e.g. a request + its response loop)
  // otherwise share identical geometry, so their lines AND labels stack. Fan them
  // out: each sibling gets a perpendicular offset (bent line + shifted label).
  const pairKey = [source, target].slice().sort().join('|')
  const siblings = edges.filter(e => [e.source, e.target].slice().sort().join('|') === pairKey)
  const parallel = siblings.length > 1

  let path, labelX, labelYRaw
  // A paired line's badge leaves the line (see badgeShift); null for a line on its own.
  let labelOff = null
  // Set when the router draws a straight line on purpose, so an explicit
  // "step" pick knows it has something to replace. The lane values let the
  // elbows of parallel siblings keep their own middle leg instead of sharing one.
  let routedStraight = false, laneShift = 0, laneAlongY = false
  let drawPath = null, hideLabel = false, hideArrow = false
  const trunk = fan && !parallel ? trunkPath({
    fan, id, sx, sy, tx, ty, edges, nodeOf, obstacles, gaps, taken, g: `fan:${fan.end}:${fan.leader}`,
    side: fan.end === 't' ? tSide : sSide, node: fan.end === 't' ? targetNode : sourceNode,
  }) : null
  if (trunk) {
    ;({ path, labelX, labelYRaw, drawPath, hideArrow } = trunk)
    hideLabel = fan.leader !== id
  } else if (parallel) {
    const n = siblings.length
    const idx = siblings.slice().sort((a, b) => (a.id < b.id ? -1 : 1)).findIndex(e => e.id === id)
    const centered = idx - (n - 1) / 2 // 0-centered rank: -1, 0, +1 ...
    // Straight lanes, evenly spaced: every sibling leaves from the same spot on
    // each face (the middle of the pair's slots) and shifts along that face by
    // its rank. Same shift at both ends, so the lanes are parallel no matter how
    // many other edges share either face. Bowing them into arcs sent a line
    // that starts in the left slot curving right, so a request and its response
    // crossed in an X and the two labels landed on top of each other.
    if (measured) {
      const slots = siblings.map(e => ({
        s: attachPoint(sourceNode, source, targetNode, e.id, edges, nodeOf),
        t: attachPoint(targetNode, target, sourceNode, e.id, edges, nodeOf),
      }))
      const mean = k => ({
        x: slots.reduce((a, o) => a + o[k].x, 0) / n,
        y: slots.reduce((a, o) => a + o[k].y, 0) / n,
      })
      const sm = mean('s'), tm = mean('t')
      const alongY = sSide === Position.Left || sSide === Position.Right // slots run down the face
      // The pair's centre lines nearly match: share one, so the lanes run
      // level instead of leaning by a few pixels from end to end.
      const k = alongY ? 'y' : 'x', run = alongY ? Math.abs(tm.x - sm.x) : Math.abs(tm.y - sm.y)
      const lean = Math.abs(tm[k] - sm[k])
      // The shift runs along the face, so a diagonal run ends up with less
      // daylight between its lanes than PAIR_GAP: a 45 degree pair sat only
      // 25px apart and a shallower one under 20, with the badges touching.
      // Widen the shift by the run's angle so the gap ACROSS the lines is
      // PAIR_GAP, but never past what both faces can hold.
      const across = Math.max(0.4, run / (Math.hypot(tm.x - sm.x, tm.y - sm.y) || 1))
      const faceOf = node => alongY ? node.measured.height : node.measured.width
      const room = n > 1 ? (Math.min(faceOf(sourceNode), faceOf(targetNode)) / 2 - 12) / ((n - 1) / 2) : PAIR_GAP
      const gap = Math.max(PAIR_GAP, Math.min(PAIR_GAP / across, room))
      if (lean && (lean <= SNAP_TOL || lean <= run * ALIGN_RATIO)) {
        const v = (sm[k] + tm[k]) / 2
        const reach = (gap * (n - 1)) / 2 + 6 // outermost lane must still land on the face
        const fits = (node, c) => Math.abs(v - c) <= faceOf(node) / 2 - reach
        if (fits(sourceNode, centerOf(sourceNode)[k]) && fits(targetNode, centerOf(targetNode)[k])) { sm[k] = v; tm[k] = v }
      }
      const shift = centered * gap
      laneShift = shift; laneAlongY = alongY
      sx = alongY ? sm.x : sm.x + shift; sy = alongY ? sm.y + shift : sm.y
      tx = alongY ? tm.x : tm.x + shift; ty = alongY ? tm.y + shift : tm.y
      // A pinned end wins over the lane; the other end keeps its lane shift.
      if (endS) { const p = pinnedPoint(sourceNode, endS); sx = p.x; sy = p.y }
      if (endT) { const p = pinnedPoint(targetNode, endT); tx = p.x; ty = p.y }
    }
    path = `M${sx},${sy} L${tx},${ty}`
    routedStraight = true
    // Stagger each sibling's label to a DIFFERENT point along its line so the
    // badges sit side by side, not on one row.
    // Measured in ONE direction for the whole pair: a request and its reply run
    // opposite ways, and 40% along each from its own start is the same spot.
    const t0 = Math.min(0.72, Math.max(0.28, 0.5 + centered * 0.16))
    const t = source < target ? t0 : 1 - t0
    labelX = sx + (tx - sx) * t
    labelYRaw = sy + (ty - sy) * t
    // The badge itself goes OFF the line, on the pair's outside, at the end
    // of a short leader: 2 lanes 36 px apart leave a badge nowhere to sit but
    // on the other lane. This is the unit direction away from the sibling;
    // the canvas and the renderer size the shift by the badge they draw.
    const len = Math.hypot(tx - sx, ty - sy) || 1
    const px = -(ty - sy) / len, py = (tx - sx) / len
    const outward = laneAlongY ? py * laneShift : px * laneShift
    const sign = outward ? Math.sign(outward) : (centered < 0 ? -1 : 1)
    labelOff = { x: px * sign, y: py * sign }
  } else if (aligned && !blocks(sx, sy, tx, ty, obstacles)) {
    // Lined up AND nothing in the way: straight line, edge to facing edge.
    path = `M${sx},${sy} L${tx},${ty}`
    routedStraight = true
    labelX = (sx + tx) / 2
    labelYRaw = (sy + ty) / 2
  } else if (obstacles.length && measured) {
    // Build the route as a polyline so each leg can be tested, and slide the
    // middle into the nearest clear lane. Falls back to the plain elbow only
    // when nothing is clear, which keeps a dense graph readable instead of
    // sending a line on a long detour.
    const sHoriz = sSide === Position.Left || sSide === Position.Right
    const tHoriz = tSide === Position.Left || tSide === Position.Right
    const S = { x: sx, y: sy }, T = { x: tx, y: ty }
    const axis = sHoriz && tHoriz ? 'x' : (!sHoriz && !tHoriz ? 'y' : null)
    // The cards only, without their notes: the line starts and ends on the
    // card's border and crosses its own note on the way, so the note must not
    // count as a wall for this edge.
    const sRect = { x: sourceNode.internals.positionAbsolute.x, y: sourceNode.internals.positionAbsolute.y, w: sourceNode.measured.width, h: sourceNode.measured.height }
    const tRect = { x: targetNode.internals.positionAbsolute.x, y: targetNode.internals.positionAbsolute.y, w: targetNode.measured.width, h: targetNode.measured.height }
    // Everything a leg must miss: other boxes, plus the cores of its own two.
    const guard = [...obstacles, shrink(sRect), shrink(tRect)]
    // A detour lands on a face this edge was never routed to, so it asks for a
    // slot there rather than taking the middle - see detourSlot.
    const slotS = side => detourSlot(sourceNode, source, side, id, edges, nodeOf)
    const slotT = side => detourSlot(targetNode, target, side, id, edges, nodeOf)
    let pts = null
    if (axis) {
      const mid = axis === 'x' ? (sx + tx) / 2 : (sy + ty) / 2
      let clear = null
      for (const c of lanes(mid, obstacles, axis, [sRect, tRect], taken.length > 0)) {
        const cand = routePoints(S, T, sHoriz, tHoriz, c)
        if (!clearPolyline(cand, guard)) continue
        clear = clear || cand
        if (!onTaken(cand, taken)) { pts = cand; break }
      }
      // Every clear lane already holds a line: try a turn close to either own
      // face, half a track at a time, then going round, else share.
      if (!pts && clear) {
        const near = axis === 'x' ? [sx, tx] : [sy, ty]
        for (let j = 1; j <= 12 && !pts; j++) for (const f of near) for (const c of [f - j * TRACK_SEP / 2, f + j * TRACK_SEP / 2]) {
          const cand = routePoints(S, T, sHoriz, tHoriz, c)
          if (!pts && clearPolyline(cand, guard) && !onTaken(cand, taken)) pts = cand
        }
      }
      if (!pts && clear) pts = detour(sRect, tRect, guard, axis === 'y', slotS, slotT, taken) || clear
      if (!pts) {
        // Nothing clear on these faces - go over the top (or round the side).
        pts = detour(sRect, tRect, guard, axis === 'y', slotS, slotT, taken)
          || detour(sRect, tRect, guard, axis !== 'y', slotS, slotT, taken)
          || detour(sRect, tRect, guard, axis === 'y', slotS, slotT)
          || routePoints(S, T, sHoriz, tHoriz, mid)
      }
    } else {
      // An L between a horizontal face and a vertical one - try it, then the
      // other way round, then give up on the L and go over/around instead.
      const a = routePoints(S, T, sHoriz, tHoriz, 0)
      const b = sHoriz ? [S, { x: S.x, y: T.y }, T] : [S, { x: T.x, y: S.y }, T]
      pts = clearPolyline(a, guard) ? a
        : clearPolyline(b, guard) ? b
          : (detour(sRect, tRect, guard, false, slotS, slotT)
            || detour(sRect, tRect, guard, true, slotS, slotT) || a)
    }
    path = roundedPath(pts)
    const m = pts[Math.floor(pts.length / 2)]
    const m2 = pts[Math.ceil(pts.length / 2)] || m
    labelX = (m.x + m2.x) / 2
    labelYRaw = (m.y + m2.y) / 2
  } else {
    // Rounded elbow: leave the box perpendicular to the face the stem came out
    // of, make ONE turn, and arrive perpendicular to the target's face. Because
    // every edge off a node shares the same anchor, fan-outs still read as one
    // stem splitting - but each branch now meets its box square instead of
    // curving into a corner.
    ;[path, labelX, labelYRaw] = getSmoothStepPath({
      sourceX: sx, sourceY: sy, sourcePosition: sSide,
      targetX: tx, targetY: ty, targetPosition: tSide,
      borderRadius: 18,
    })
  }
  // An arrow type picked in the format panel replaces the routing outright,
  // the way Excalidraw's arrow type does: the pick is what the line looks
  // like. Straight and curved are the owner saying they would rather have the
  // short line than the one that dodges the boxes in between. Step is the
  // routing above except where the router drew a straight line on purpose (a
  // lined-up pair, or parallel lanes on a diagonal): a lit step tile over a
  // diagonal read as a dead control, so there it draws the elbow it promises.
  // Between level ends that elbow is still a straight line, as it should be.
  if (!bend && arrow === 'step' && routedStraight) {
    ;[path, labelX, labelYRaw] = getSmoothStepPath({
      sourceX: sx, sourceY: sy, sourcePosition: sSide,
      targetX: tx, targetY: ty, targetPosition: tSide,
      borderRadius: 18,
      ...(laneShift ? (laneAlongY ? { centerX: (sx + tx) / 2 + laneShift } : { centerY: (sy + ty) / 2 + laneShift }) : {}),
    })
  } else if (!bend && arrow === 'straight') {
    path = `M${sx},${sy} L${tx},${ty}`
    labelX = (sx + tx) / 2
    labelYRaw = (sy + ty) / 2
  } else if (!bend && arrow === 'curved') {
    ;[path, labelX, labelYRaw] = getBezierPath({
      sourceX: sx, sourceY: sy, sourcePosition: sSide,
      targetX: tx, targetY: ty, targetPosition: tSide,
    })
  }
  // A hand-bent line: a quadratic curve through the bend point, replacing
  // whatever the automatic routing chose.
  if (bend) {
    const B = bendPoint(sx, sy, tx, ty, bend)
    const qx = 2 * B.x - (sx + tx) / 2, qy = 2 * B.y - (sy + ty) / 2
    path = `M${sx},${sy} Q${qx},${qy} ${tx},${ty}`
    labelX = B.x; labelYRaw = B.y
  }
  // If the label lands on top of a service node, lift it just above that node so
  // the text never overlaps a box.
  let labelY = labelYRaw
  for (const r of nodeRects) {
    if (labelX > r.x - 4 && labelX < r.x + r.w + 4 && labelYRaw > r.y - 4 && labelYRaw < r.y + r.h + 4) {
      // Push out the NEAREST side (top or bottom) by the minimal amount so the
      // label clears the node while staying as close to the edge as possible.
      labelY = labelYRaw < r.y + r.h / 2 ? r.y - 12 : r.y + r.h + 12
      break
    }
  }
  // Every line reserves the track it draws on, for the lines after it. A
  // hand-made line (bend, straight, curved) is the owner's call: it reserves nothing.
  const g = fan ? `fan:${fan.end}:${fan.leader}` : id
  const legs = bend || arrow === 'straight' || arrow === 'curved' ? [] : pathLegs(drawPath || path).map(l => ({ ...l, g }))
  return { legs, path, drawPath: drawPath || path, hideLabel, hideArrow, sx, sy, tx, ty, sSide, tSide, labelX, labelY, labelYRaw, labelOff }
}

// Where a paired line's badge sits: `off` is routeEdge's unit direction away
// from the sibling line, w and h the badge's box. The badge clears its own
// line by LEAD px whatever the line's angle, so the box's extent across the
// line (wide badge, steep line) is counted in. The leader runs from the
// on-path point to the badge's centre; the badge paints over its inner end.
export const LEAD = 14
export function badgeShift(off, w, h, lead = 0) {
  if (!off) return { dx: 0, dy: 0 }
  const d = (w / 2) * Math.abs(off.x) + (h / 2) * Math.abs(off.y) + LEAD + lead
  return { dx: off.x * d, dy: off.y * d }
}

// ─── Measuring a path without a browser ───────────────────────────────────────
// The canvas asks the DOM how long a path is and where a fraction along it
// lands (SVGPathElement.getPointAtLength). The server has no DOM, so the same
// question is answered by flattening the path into short straight pieces. The
// paths here only ever use M, L, Q and C in absolute form - that is all the
// routing above and React Flow's path helpers emit.
const NUM_RE = /-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/gi
const CURVE_STEPS = 24

export function flattenPath(d) {
  const pts = []
  let cur = { x: 0, y: 0 }
  for (const m of String(d || '').matchAll(/([MLQCZz])([^MLQCZz]*)/g)) {
    const cmd = m[1], nums = (m[2].match(NUM_RE) || []).map(Number)
    if (cmd === 'M' || cmd === 'L') {
      for (let i = 0; i + 1 < nums.length; i += 2) { cur = { x: nums[i], y: nums[i + 1] }; pts.push(cur) }
    } else if (cmd === 'Q') {
      for (let i = 0; i + 3 < nums.length; i += 4) {
        const p0 = cur, c = { x: nums[i], y: nums[i + 1] }, p1 = { x: nums[i + 2], y: nums[i + 3] }
        for (let s = 1; s <= CURVE_STEPS; s++) {
          const t = s / CURVE_STEPS, u = 1 - t
          pts.push({ x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x, y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y })
        }
        cur = p1
      }
    } else if (cmd === 'C') {
      for (let i = 0; i + 5 < nums.length; i += 6) {
        const p0 = cur, c1 = { x: nums[i], y: nums[i + 1] }, c2 = { x: nums[i + 2], y: nums[i + 3] }, p1 = { x: nums[i + 4], y: nums[i + 5] }
        for (let s = 1; s <= CURVE_STEPS; s++) {
          const t = s / CURVE_STEPS, u = 1 - t
          pts.push({
            x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p1.x,
            y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p1.y,
          })
        }
        cur = p1
      }
    }
  }
  return pts
}

// The point a fraction t along the path, by arc length - the same answer the
// DOM gives, to well under a pixel on these paths.
export function pointAlongPath(d, t) {
  const pts = flattenPath(d)
  if (!pts.length) return null
  if (pts.length === 1) return pts[0]
  const seg = []
  let total = 0
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); seg.push(l); total += l }
  if (!total) return pts[0]
  let want = Math.min(1, Math.max(0, t)) * total
  for (let i = 0; i < seg.length; i++) {
    if (want <= seg[i] || i === seg.length - 1) {
      const f = seg[i] ? want / seg[i] : 0
      return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * f, y: pts[i].y + (pts[i + 1].y - pts[i].y) * f }
    }
    want -= seg[i]
  }
  return pts[pts.length - 1]
}

// ─── No tag on a tag (owner rule 2026-10-09) ──────────────────────────────────
// Badges are placed in edges order, like the tracks above. A badge the router
// placed that would land on an earlier one slides along its OWN line to the
// first clear spot, so it still reads as that line's. A badge the owner slid
// by hand stays put but counts as placed. The box is an estimate shared by the
// canvas and the renderer, so both pick the same spot.
const BADGE_GAP = 4
export function badgeBox(tag, step) {
  let w = 0
  for (const ch of String(tag || '')) w += ch === ' ' ? 0.28 : /[il.,:;'|!I[\]()jft]/.test(ch) ? 0.3 : /[mwMW@%]/.test(ch) ? 0.9 : /[A-Z]/.test(ch) ? 0.68 : 0.58
  return { w: 16 + w * 8.5 * 1.16 + (step ? 20 : 0), h: 18 } // 10% over the renderer width: the browser draws a touch wider
}
export function clearBadge(path, at, box, off, placed) {
  const { dx, dy } = badgeShift(off, box.w, box.h)
  const hit = (p, k = 0) => placed.some(b => Math.abs(p.x + dx + k * (off?.x || 0) - b.x) * 2 < box.w + b.w + BADGE_GAP
    && Math.abs(p.y + dy + k * (off?.y || 0) - b.y) * 2 < box.h + b.h + BADGE_GAP)
  if (!hit(at)) return at
  for (const t of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.15, 0.85]) {
    const p = pointAlongPath(path, t)
    if (p && !hit(p)) return p
  }
  // A short paired line with no clear spot: its leader grows instead (`lead`).
  if (off) for (const k of [12, 24, 36, 48, 60]) if (!hit(at, k)) return { ...at, lead: k }
  return at
}
