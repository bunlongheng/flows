import { useState, useEffect } from 'react'
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, useInternalNode, useReactFlow, Position } from '@xyflow/react'
import { subscribe, currentPhase, motionAllowed, offsetFor } from '../flowClock'

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
  if (side === Position.Right) return { x: c.x + w2, y: c.y + offset, side, alone: n === 1 }
  if (side === Position.Left) return { x: c.x - w2, y: c.y + offset, side, alone: n === 1 }
  if (side === Position.Bottom) return { x: c.x + offset, y: c.y + h2, side, alone: n === 1 }
  return { x: c.x + offset, y: c.y - h2, side, alone: n === 1 }
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

export function GradientEdge({
  id, source, target, sourceX, sourceY, targetX, targetY, markerEnd, data, label,
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

  const allEdges = getEdges()
  // Every other service box is something this edge must not run through.
  const obstacles = getNodes()
    .filter(n => n.type === 'awsNode' && n.id !== source && n.id !== target && n.measured?.width && n.position)
    .map(n => ({ x: n.position.x, y: n.position.y, w: n.measured.width, h: n.measured.height }))
  let sx = sourceX, sy = sourceY, tx = targetX, ty = targetY
  let sSide = Position.Right, tSide = Position.Left
  let aligned = false
  if (sourceNode?.measured?.width && targetNode?.measured?.width) {
    const nodeOf = nid => (nid === source ? sourceNode : nid === target ? targetNode : internalById(nid))
    const sp2 = attachPoint(sourceNode, source, targetNode, id, allEdges, nodeOf)
    const tp2 = attachPoint(targetNode, target, sourceNode, id, allEdges, nodeOf)
    sx = sp2.x; sy = sp2.y; sSide = sp2.side
    tx = tp2.x; ty = tp2.y; tSide = tp2.side

    // Straight run for a pair that lines up - but only when neither face is
    // sharing slots, otherwise forcing this one to center would collide with a
    // neighbour's slot.
    if (sp2.alone && tp2.alone) {
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
    const dx = tx - sx, dy = ty - sy
    const L = Math.hypot(dx, dy) || 1
    // Canonical perpendicular (same vector for both directions) so siblings split
    // to opposite sides instead of collapsing onto each other.
    const flip = source < target ? 1 : -1
    const px = (-dy / L) * flip, py = (dx / L) * flip
    const mx = (sx + tx) / 2, my = (sy + ty) / 2
    // Bow each sibling out into a big arc so a request+response reads as a clear
    // loop, not two cramped near-parallel lines. Bend scales with edge length
    // (capped) so short and long loops both look round.
    const bow = centered * Math.min(150, Math.max(70, L * 0.32))
    const cx = mx + px * bow, cy = my + py * bow
    path = `M${sx},${sy} Q${cx},${cy} ${tx},${ty}`
    // Stagger each sibling's label to a DIFFERENT point along its curve so the
    // labels spread out along the arc instead of stacking on one line.
    const t = Math.min(0.72, Math.max(0.28, 0.5 + centered * 0.16))
    const mt = 1 - t
    labelX = mt * mt * sx + 2 * mt * t * cx + t * t * tx
    labelYRaw = mt * mt * sy + 2 * mt * t * cy + t * t * ty
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
    const sRect = { x: sourceNode.internals.positionAbsolute.x, y: sourceNode.internals.positionAbsolute.y, w: sourceNode.measured.width, h: sourceNode.measured.height }
    const tRect = { x: targetNode.internals.positionAbsolute.x, y: targetNode.internals.positionAbsolute.y, w: targetNode.measured.width, h: targetNode.measured.height }
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
  const c1 = data?.sourceColor || '#6b7280'
  const c2 = data?.targetColor || '#6b7280'
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
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ stroke: `url(#${gid})`, strokeWidth: 1.5 }} />
        <FlowDot edgeId={id} path={path} color={c1} />
      {(label || hasStep) && (
        <EdgeLabelRenderer>
          <div
            className={`sd-edge-badge nodrag nopan${movable ? ' is-movable' : ''}${dragT != null ? ' is-dragging' : ''}`}
            onPointerDown={startDrag}
            onDoubleClick={movable ? e => { e.stopPropagation(); data.onLabelMove(id, null) } : undefined}
            title={movable ? 'Drag along the edge to reposition; double-click to reset' : undefined}
            style={{
              transform: `translate(-50%, -50%) translate(${bx}px, ${by}px)`,
              '--c1': c1, '--c2': c2,
            }}
          >
            {hasStep && <span className="sd-step-chip">{data.step}</span>}
            {label && <span>{label}</span>}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
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
