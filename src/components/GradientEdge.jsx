import { useState, useEffect, useSyncExternalStore } from 'react'
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, useInternalNode, useReactFlow, Position } from '@xyflow/react'
import { getNoteHeight, subscribeNoteHeights, noteHeightsVersion } from './noteEditContext'
import { subscribe, currentPhase, motionAllowed, offsetFor } from '../flowClock'
import { SUNSET, INK } from '../sunset.js'

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

const centerOf = n => ({
  x: n.internals.positionAbsolute.x + n.measured.width / 2,
  y: n.internals.positionAbsolute.y + n.measured.height / 2,
})

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
  const side = sideFor(c, centerOf(otherNode))
  const horizontal = side === Position.Left || side === Position.Right

  const peers = []
  for (const e of edges) {
    const farId = e.source === nodeId ? e.target : e.target === nodeId ? e.source : null
    if (!farId || farId === nodeId) continue
    const far = nodeOf(farId)
    if (!far?.measured?.width) continue
    const fc = centerOf(far)
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
  // The bottom face is the card's edge, but the note hangs BELOW that edge and
  // is opaque, so a line leaving here would run behind it and re-emerge lower -
  // reading as a line that dead-ends into a box. Start under the note instead,
  // clear of its border - the published height carries that daylight, so a line
  // never touches the frame. Only this face moves: the note is not beside or
  // above the card.
  if (side === Position.Bottom) return { x: c.x + offset, y: c.y + h2 + getNoteHeight(nodeId), ...at }
  return { x: c.x + offset, y: c.y - h2, ...at }
}

// Can this slot move from `from` to `to` along its face? It must stay inside the
// box, and a shared face must not let it cross into the neighbouring slot.
const canSlide = (p, from, to) => {
  const d = Math.abs(to - from)
  if (d === 0) return true
  if (Math.abs(to - p.mid) > p.half - 10) return false
  return p.alone || d <= p.gap / 2 - 2
}

// One coordinate both ends can share: keep a lone (centred) end where it is and
// move the spread one, else meet in the middle, else take whichever end can.
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

// Lanes to try for the middle of the route: the natural midpoint first, then
// just clear of each box's edges, nearest first.
//
// `own` is the edge's own two boxes. They are not obstacles - the route starts
// and ends on their borders - but the MIDDLE of the route must still not sit
// inside them, or the line doubles back and crosses the box it just left. That
// is invisible to the obstacle test, which excludes both endpoints by design.
const lanes = (mid, rects, axis, own = []) => {
  const out = [mid]
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
function detour(sRect, tRect, rects, vertical) {
  const sc = { x: sRect.x + sRect.w / 2, y: sRect.y + sRect.h / 2 }
  const tc = { x: tRect.x + tRect.w / 2, y: tRect.y + tRect.h / 2 }
  for (const before of [true, false]) {
    const s = vertical
      ? { x: before ? sRect.x : sRect.x + sRect.w, y: sc.y }
      : { x: sc.x, y: before ? sRect.y : sRect.y + sRect.h }
    const t = vertical
      ? { x: before ? tRect.x : tRect.x + tRect.w, y: tc.y }
      : { x: tc.x, y: before ? tRect.y : tRect.y + tRect.h }
    const mid = vertical ? (s.x + t.x) / 2 : (s.y + t.y) / 2
    for (const c of lanes(mid, rects, vertical ? 'x' : 'y', [sRect, tRect])) {
      const pts = vertical
        ? [s, { x: c, y: s.y }, { x: c, y: t.y }, t]
        : [s, { x: s.x, y: c }, { x: t.x, y: c }, t]
      if (clearPolyline(pts, rects)) return pts
    }
  }
  return null
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

// Edge whose line is a gradient from the SOURCE node's color to the TARGET
// node's color, connected at the nearest borders. The label badge sits at the
// midpoint; the Steps chip is a chip inside that badge.
// Measuring a path needs a real SVGPathElement, and it has to be IN the document
// - a detached one reports getTotalLength() as 0 in Chrome, which silently made
// every drag a no-op. One hidden element is reused rather than allocating per
// drag frame.
let measurePath = null
function pathEl(d) {
  if (!measurePath) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('aria-hidden', 'true')
    svg.setAttribute('width', '0')
    svg.setAttribute('height', '0')
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none'
    measurePath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    svg.appendChild(measurePath)
    document.body.appendChild(svg)
  }
  measurePath.setAttribute('d', d)
  return measurePath
}

// The point a fraction t along the path.
function pointOnPath(d, t) {
  try {
    const el = pathEl(d)
    const len = el.getTotalLength()
    if (!len) return null
    const p = el.getPointAtLength(Math.min(1, Math.max(0, t)) * len)
    return { x: p.x, y: p.y }
  } catch { return null }
}

// A badge is kept off the very ends of its edge: t=0 and t=1 sit under the two
// service boxes, where the badge is hidden and unclickable.
const T_MIN = 0.12, T_MAX = 0.88

// The fraction along the path closest to (x, y). Coarse sweep, then a local
// refinement - enough for a badge, and cheap enough to run per drag frame.
function nearestTOnPath(d, x, y) {
  try {
    const el = pathEl(d)
    const len = el.getTotalLength()
    if (!len) return null
    const d2 = tt => { const p = el.getPointAtLength(tt * len); return (p.x - x) ** 2 + (p.y - y) ** 2 }
    let best = 0, bestD = Infinity
    const N = 80
    for (let i = 0; i <= N; i++) { const tt = i / N, dd = d2(tt); if (dd < bestD) { bestD = dd; best = tt } }
    let step = 1 / N
    for (let pass = 0; pass < 4; pass++) {
      step /= 4
      for (const tt of [best - step, best + step]) {
        const c = Math.min(1, Math.max(0, tt)), dd = d2(c)
        if (dd < bestD) { bestD = dd; best = c }
      }
    }
    return Math.min(T_MAX, Math.max(T_MIN, best))
  } catch { return null }
}

const SIDE_OF = { top: Position.Top, right: Position.Right, bottom: Position.Bottom, left: Position.Left }
const END_MIN = 0.05, END_MAX = 0.95

const BEND_T = [0.1, 0.9], BEND_D = 600

// The straight run S->T as a unit vector and its length. A bend is kept in
// this frame so it follows the boxes when they move.
const bendFrame = (sx, sy, tx, ty) => {
  const dx = tx - sx, dy = ty - sy, len = Math.hypot(dx, dy) || 1
  return { ux: dx / len, uy: dy / len, len }
}
function bendPoint(sx, sy, tx, ty, b) {
  const { ux, uy, len } = bendFrame(sx, sy, tx, ty)
  return { x: sx + ux * len * b.t - uy * b.d, y: sy + uy * len * b.t + ux * b.d }
}
// The bend that puts the bend point under a dragged (px, py).
function bendFor(sx, sy, tx, ty, px, py) {
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
function nearestEnd(node, px, py) {
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

export function GradientEdge({
  id, source, target, sourceX, sourceY, targetX, targetY, markerEnd, data, label, selected,
}) {
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)
  const { getNodes, getEdges, screenToFlowPosition } = useReactFlow()
  // Stem direction needs the OTHER nodes' geometry, and useInternalNode only
  // covers this edge's two ends, so measured sizes come off the node list.
  const internalById = id => {
    const n = getNodes().find(x => x.id === id)
    return n?.measured?.width
      ? { measured: n.measured, internals: { positionAbsolute: n.position } }
      : null
  }

  // A note is measured after its node paints, and re-wraps whenever the card is
  // resized or the text edited. Subscribing keeps the route honest instead of
  // leaving it computed against a height that has since changed.
  useSyncExternalStore(subscribeNoteHeights, noteHeightsVersion, () => 0)

  const allEdges = getEdges()
  // Every other service box is something this edge must not run through.
  // A note hangs below its card and React Flow does not measure it, so the box
  // to avoid is the card PLUS whatever the note wraps to. Without this a line
  // leaving a bottom face runs under the note and vanishes behind it - the box
  // is opaque, so the connection reads as broken.
  const obstacles = getNodes()
    .filter(n => n.type === 'awsNode' && n.id !== source && n.id !== target && n.measured?.width && n.position)
    .map(n => ({ x: n.position.x, y: n.position.y, w: n.measured.width, h: n.measured.height + getNoteHeight(n.id) }))
  // A pinned end overrides the automatic attach point for that side only. Live
  // drag wins over the saved value while it is in progress.
  const [dragEnd, setDragEnd] = useState(null)
  const [dragBend, setDragBend] = useState(null)
  const bend = dragBend || data?.bend
  const endS = dragEnd?.which === 's' ? dragEnd : data?.ends?.s
  const endT = dragEnd?.which === 't' ? dragEnd : data?.ends?.t
  let sx = sourceX, sy = sourceY, tx = targetX, ty = targetY
  let sSide = Position.Right, tSide = Position.Left
  let aligned = false
  if (sourceNode?.measured?.width && targetNode?.measured?.width) {
    const nodeOf = nid => (nid === source ? sourceNode : nid === target ? targetNode : internalById(nid))
    const sp2 = attachPoint(sourceNode, source, targetNode, id, allEdges, nodeOf)
    const tp2 = attachPoint(targetNode, target, sourceNode, id, allEdges, nodeOf)
    sx = sp2.x; sy = sp2.y; sSide = sp2.side
    tx = tp2.x; ty = tp2.y; tSide = tp2.side
    if (endS) { const p = pinnedPoint(sourceNode, endS); sx = p.x; sy = p.y; sSide = p.side }
    if (endT) { const p = pinnedPoint(targetNode, endT); tx = p.x; ty = p.y; tSide = p.side }

    // Straight run for a pair that lines up - but only when neither face is
    // sharing slots, otherwise forcing this one to center would collide with a
    // neighbour's slot. A pinned end is where the owner put it, so it never
    // gets snapped back onto an auto-computed line.
    if (!endS && !endT && sp2.alone && tp2.alone) {
      const sc = centerOf(sourceNode), tc = centerOf(targetNode)
      const driftY = Math.abs(sc.y - tc.y), driftX = Math.abs(sc.x - tc.x)
      if (driftX >= driftY && onAxis(driftY, driftX)) {
        aligned = true
        const y = (sc.y + tc.y) / 2
        sy = y; ty = y
      } else if (onAxis(driftX, driftY)) {
        aligned = true
        const x = (sc.x + tc.x) / 2
        sx = x; tx = x
      }
    }
    // Slots that nearly line up get pulled onto one line. Same proportional
    // rule as the centre test, with a floor wide enough to cover a spread slot.
    if (!aligned && !endS && !endT) {
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
  const siblings = getEdges().filter(e => [e.source, e.target].slice().sort().join('|') === pairKey)
  const parallel = siblings.length > 1

  let path, labelX, labelYRaw
  if (parallel) {
    const n = siblings.length
    const idx = siblings.slice().sort((a, b) => (a.id < b.id ? -1 : 1)).findIndex(e => e.id === id)
    const centered = idx - (n - 1) / 2 // 0-centered rank: -1, 0, +1 ...
    // Straight lanes, evenly spaced: every sibling leaves from the same spot on
    // each face (the middle of the pair's slots) and shifts along that face by
    // its rank. Same shift at both ends, so the lanes are parallel no matter how
    // many other edges share either face. Bowing them into arcs sent a line
    // that starts in the left slot curving right, so a request and its response
    // crossed in an X and the two labels landed on top of each other.
    if (sourceNode?.measured?.width && targetNode?.measured?.width) {
      const nodeOf = nid => (nid === source ? sourceNode : nid === target ? targetNode : internalById(nid))
      const slots = siblings.map(e => ({
        s: attachPoint(sourceNode, source, targetNode, e.id, allEdges, nodeOf),
        t: attachPoint(targetNode, target, sourceNode, e.id, allEdges, nodeOf),
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
      sx = alongY ? sm.x : sm.x + shift; sy = alongY ? sm.y + shift : sm.y
      tx = alongY ? tm.x : tm.x + shift; ty = alongY ? tm.y + shift : tm.y
      // A pinned end wins over the lane; the other end keeps its lane shift.
      if (endS) { const p = pinnedPoint(sourceNode, endS); sx = p.x; sy = p.y }
      if (endT) { const p = pinnedPoint(targetNode, endT); tx = p.x; ty = p.y }
    }
    path = `M${sx},${sy} L${tx},${ty}`
    // Stagger each sibling's label to a DIFFERENT point along its line so the
    // badges sit side by side, not on one row.
    // Measured in ONE direction for the whole pair: a request and its reply run
    // opposite ways, and 40% along each from its own start is the same spot.
    const t0 = Math.min(0.72, Math.max(0.28, 0.5 + centered * 0.16))
    const t = source < target ? t0 : 1 - t0
    labelX = sx + (tx - sx) * t
    labelYRaw = sy + (ty - sy) * t
  } else if (aligned && !blocks(sx, sy, tx, ty, obstacles)) {
    // Lined up AND nothing in the way: straight line, edge to facing edge.
    path = `M${sx},${sy} L${tx},${ty}`
    labelX = (sx + tx) / 2
    labelYRaw = (sy + ty) / 2
  } else if (obstacles.length) {
    // Build the route as a polyline so each leg can be tested, and slide the
    // middle into the nearest clear lane. Falls back to the plain elbow only
    // when nothing is clear, which keeps a dense graph readable instead of
    // sending a line on a long detour.
    const sHoriz = sSide === Position.Left || sSide === Position.Right
    const tHoriz = tSide === Position.Left || tSide === Position.Right
    const S = { x: sx, y: sy }, T = { x: tx, y: ty }
    const axis = sHoriz && tHoriz ? 'x' : (!sHoriz && !tHoriz ? 'y' : null)
    const sRect = { x: sourceNode.internals.positionAbsolute.x, y: sourceNode.internals.positionAbsolute.y, w: sourceNode.measured.width, h: sourceNode.measured.height + getNoteHeight(source) }
    const tRect = { x: targetNode.internals.positionAbsolute.x, y: targetNode.internals.positionAbsolute.y, w: targetNode.measured.width, h: targetNode.measured.height + getNoteHeight(target) }
    // Everything a leg must miss: other boxes, plus the cores of its own two.
    const guard = [...obstacles, shrink(sRect), shrink(tRect)]
    let pts = null
    if (axis) {
      const mid = axis === 'x' ? (sx + tx) / 2 : (sy + ty) / 2
      for (const c of lanes(mid, obstacles, axis, [sRect, tRect])) {
        const cand = routePoints(S, T, sHoriz, tHoriz, c)
        if (clearPolyline(cand, guard)) { pts = cand; break }
      }
      if (!pts) {
        // Nothing clear on these faces - go over the top (or round the side).
        pts = detour(sRect, tRect, guard, axis === 'y')
          || detour(sRect, tRect, guard, axis !== 'y')
          || routePoints(S, T, sHoriz, tHoriz, mid)
      }
    } else {
      // An L between a horizontal face and a vertical one - try it, then the
      // other way round, then give up on the L and go over/around instead.
      const a = routePoints(S, T, sHoriz, tHoriz, 0)
      const b = sHoriz ? [S, { x: S.x, y: T.y }, T] : [S, { x: T.x, y: S.y }, T]
      pts = clearPolyline(a, guard) ? a
        : clearPolyline(b, guard) ? b
          : (detour(sRect, tRect, guard, false) || detour(sRect, tRect, guard, true) || a)
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
  for (const n of getNodes()) {
    if (n.type !== 'awsNode' || !n.measured) continue
    const { x, y } = n.position
    const w = n.measured.width, h = n.measured.height
    if (labelX > x - 4 && labelX < x + w + 4 && labelYRaw > y - 4 && labelYRaw < y + h + 4) {
      // Push out the NEAREST side (top or bottom) by the minimal amount so the
      // label clears the node while staying as close to the edge as possible.
      labelY = labelYRaw < y + h / 2 ? y - 12 : y + h + 12
      break
    }
  }
  const c1 = data?.sourceColor || INK
  const c2 = data?.targetColor || INK
  // Into a sunset node: the badge drops its style and goes flat silver with a
  // red X, whatever badge style the owner picked, so the outdated route reads.
  const sunset = data?.sunset === true
  const gid = `grad-${id}`
  const hasStep = data?.step != null

  // Auto-placement gets a badge off its own node, but it cannot know about the
  // OTHER badges, so on a dense diagram two can still land on each other. The
  // fix is to SLIDE a badge along its own edge - never to park it out on open
  // canvas, where it stops being obvious which edge it belongs to.
  //
  // So the saved position is `labelT`, a 0..1 distance along the edge path, not
  // a free dx/dy. It also survives the nodes moving: the path changes, the
  // fraction along it does not.
  const savedT = typeof data?.labelT === 'number' ? data.labelT : null
  const [dragT, setDragT] = useState(null)
  const t = dragT ?? savedT
  const movable = typeof data?.onLabelMove === 'function'
  const endMovable = typeof data?.onEndMove === 'function'
  const bendMovable = typeof data?.onBendMove === 'function'

  const startBendDrag = e => {
    if (!bendMovable || e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    let last = null
    const move = ev => {
      const f = screenToFlowPosition({ x: ev.clientX, y: ev.clientY })
      last = bendFor(sx, sy, tx, ty, f.x, f.y)
      setDragBend(last)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setDragBend(null)
      const saved = data?.bend
      if (last && (!saved || saved.t !== last.t || saved.d !== last.d)) data.onBendMove(id, last)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const startEndDrag = (e, which) => {
    if (!endMovable || e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    const node = which === 's' ? sourceNode : targetNode
    let last = null
    const move = ev => {
      const f = screenToFlowPosition({ x: ev.clientX, y: ev.clientY })
      last = nearestEnd(node, f.x, f.y)
      setDragEnd({ which, ...last })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setDragEnd(null)
      const saved = data?.ends?.[which]
      if (last && (!saved || saved.side !== last.side || saved.at !== last.at)) data.onEndMove(id, which, last)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const startDrag = e => {
    if (!movable || e.button !== 0) return
    // The canvas would otherwise pan, and the edge would take the click.
    e.stopPropagation()
    e.preventDefault()
    let last = t
    const move = ev => {
      const f = screenToFlowPosition({ x: ev.clientX, y: ev.clientY })
      last = nearestTOnPath(path, f.x, f.y)
      setDragT(last)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setDragT(null)
      // A plain click should not dirty the diagram.
      if (last != null && Math.abs(last - (savedT ?? -1)) > 0.001) data.onLabelMove(id, last)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // Where the badge actually sits: on the path when it has been placed, else the
  // computed spot with its node-avoidance nudge.
  const onPath = t == null ? null : pointOnPath(path, t)
  const bx = onPath ? onPath.x : labelX
  const by = onPath ? onPath.y : labelY

  return (
    <>
      <defs>
        <linearGradient id={gid} gradientUnits="userSpaceOnUse" x1={sx} y1={sy} x2={tx} y2={ty}>
          <stop offset="0%" stopColor={c1} />
          <stop offset="100%" stopColor={c2} />
        </linearGradient>
      </defs>
      {selected && <path className="sd-edge-halo" d={path} fill="none" stroke={c1} strokeWidth={10} strokeOpacity={0.18} strokeLinecap="round" pointerEvents="none" />}
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ stroke: `url(#${gid})`, strokeWidth: selected ? 2.5 : 1.5 }} />
        <FlowDot edgeId={id} path={path} color={c1} />
      {(label || hasStep || ((endMovable || bendMovable) && selected)) && (
        <EdgeLabelRenderer>
          {(label || hasStep) && (
            <div
              className={`sd-edge-badge nodrag nopan${movable ? ' is-movable' : ''}${dragT != null ? ' is-dragging' : ''}`}
              onPointerDown={startDrag}
              onDoubleClick={movable ? e => { e.stopPropagation(); data.onLabelMove(id, null) } : undefined}
              title={movable ? 'Drag along the edge to reposition; double-click to reset' : undefined}
              style={{
                transform: `translate(-50%, -50%) translate(${bx}px, ${by}px)`,
                '--c1': c1, '--c2': c2,
                ...(sunset ? { color: SUNSET.ink, background: SUNSET.tint, border: `1.5px solid ${SUNSET.border}`, textShadow: 'none' } : {}),
              }}
            >
              {sunset && <SunsetX size={12} />}
              {hasStep && <span className="sd-step-chip">{data.step}</span>}
              {label && <span>{label}</span>}
            </div>
          )}
          {endMovable && selected && [['s', sx, sy, data?.sourceColor], ['t', tx, ty, data?.targetColor]].map(([which, x, y, color]) => (
            <div key={which} className="sd-edge-end nodrag nopan" onPointerDown={e => startEndDrag(e, which)}
              onDoubleClick={e => { e.stopPropagation(); data.onEndMove(id, which, null) }}
              title="Drag to another spot on the box; double-click to reset"
              style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`, width: 14, height: 14, borderRadius: '50%', background: color || '#6b7280', border: '2px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,0.25)', cursor: 'grab', pointerEvents: 'all', zIndex: 2 }} />
          ))}
          {bendMovable && selected && (() => {
            const h = bend ? bendPoint(sx, sy, tx, ty, bend) : (pointOnPath(path, 0.5) || { x: labelX, y: labelY })
            return (
              <div className="sd-edge-bend nodrag nopan" onPointerDown={startBendDrag}
                onDoubleClick={e => { e.stopPropagation(); data.onBendMove(id, null) }}
                title="Drag to bend the line; double-click to straighten"
                style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${h.x}px, ${h.y}px)`, width: 14, height: 14, borderRadius: '50%', background: 'rgba(255,255,255,0.9)', border: `2px solid ${c1}`, boxShadow: '0 0 0 2px #fff', cursor: 'move', pointerEvents: 'all', zIndex: 3 }} />
            )
          })()}
        </EdgeLabelRenderer>
      )}
    </>
  )
}

// The red X that marks something outdated: on a sunset card's icon and on the
// badge of every edge into it. Sits on the top-right corner of its parent.
export function SunsetX({ size = 16 }) {
  const r = size / 2
  return (
    <svg aria-label="Sunset: gets decommissioned" width={size} height={size} viewBox="0 0 16 16"
      style={{ position: 'absolute', top: -r + 1, right: -r + 1, pointerEvents: 'none', filter: 'drop-shadow(0 0 0 #fff)' }}>
      <circle cx="8" cy="8" r="7.5" fill={SUNSET.x} stroke="#fff" strokeWidth="1" />
      <path d="M5 5 L11 11 M11 5 L5 11" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

// The travelling dot. It carries the SOURCE service's brand colour, so a reader
// can tell at a glance which way a connection runs and what it runs from - the
// Chrome edge leaves Chrome blue. Small and soft on purpose: this diagram is a
// technical document, and the dot is here to say "direction", not to decorate.
function FlowDot({ edgeId, path, color }) {
  const [t, setT] = useState(() => (currentPhase() + offsetFor(edgeId)) % 1)

  useEffect(() => {
    if (!motionAllowed()) return
    return subscribe(p => setT((p + offsetFor(edgeId)) % 1))
  }, [edgeId])

  // Ease in and out of the endpoints so the dot appears to leave the source box
  // and arrive at the target, rather than popping through both of them.
  const pt = pointOnPath(path, t)
  if (!pt) return null
  const fade = Math.min(1, Math.min(t, 1 - t) / 0.12)

  return (
    <g className="sd-flow-dot" pointerEvents="none" opacity={fade}>
      <circle cx={pt.x} cy={pt.y} r={5} fill={color} opacity={0.18} />
      <circle cx={pt.x} cy={pt.y} r={2.4} fill={color} />
    </g>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- edgeTypes must live alongside GradientEdge for <ReactFlow edgeTypes={edgeTypes}>
export const edgeTypes = { gradient: GradientEdge }
