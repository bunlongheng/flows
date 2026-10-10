import { useState, useEffect, useSyncExternalStore } from 'react'
import { BaseEdge, EdgeLabelRenderer, useInternalNode, useReactFlow, useStore } from '@xyflow/react'
import { getNoteHeight, subscribeNoteHeights, noteHeightsVersion } from './noteEditContext'
import { subscribe, currentPhase, motionAllowed, dotAt, ambientAt } from '../flowClock'
import { SUNSET, INK } from '../sunset.js'
import { dashArray } from '../style.js'
import { routeEdge, badgeShift, badgeBox, clearBadge, pointAlongPath, bendPoint, bendFor, isElbow, elbowFor, elbowHandle, nearestEnd, T_MIN, T_MAX } from '../edgeGeometry.js'
import { laneGaps, isLaneNode } from '../lanes.js'
import { tagText } from '../tag.js'
import { EDGE_LABEL_MAX } from '../note.js'

// The routing itself lives in src/edgeGeometry.js, shared with the server
// renderer so an export is the line the canvas draws. Only the DOM measuring
// for drags stays here.

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

// The point a fraction t along the path. Each path is sampled once into 256
// evenly spaced points and read back by interpolation: thousands of current
// dots a frame cannot each pay for a getPointAtLength.
const lutCache = new Map()
function lutOf(d) {
  let lut = lutCache.get(d)
  if (lut !== undefined) return lut
  lut = null
  try {
    const el = pathEl(d)
    const len = el.getTotalLength()
    if (len) {
      lut = new Float64Array(514)
      for (let i = 0; i <= 256; i++) { const p = el.getPointAtLength(len * i / 256); lut[2 * i] = p.x; lut[2 * i + 1] = p.y }
    }
  } catch { lut = null }
  if (lutCache.size > 2000) lutCache.clear()
  lutCache.set(d, lut)
  return lut
}
function pointOnPath(d, t) {
  const lut = lutOf(d)
  if (!lut) return null
  const f = Math.min(1, Math.max(0, t)) * 256, i = Math.min(255, Math.floor(f)), r = f - i
  return { x: lut[2 * i] + (lut[2 * i + 2] - lut[2 * i]) * r, y: lut[2 * i + 1] + (lut[2 * i + 3] - lut[2 * i + 1]) * r }
}

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

// Middle legs of every earlier line, in edges order, so this line never lies
// on one (render-svg.js accumulates the same list). Routed once per frame of
// node, edge and note-height state, then shared by every edge. The same pass
// places every auto badge clear of the badges before it (`badgeAt`).
let takenCache = { nodes: null, edges: null, notes: -1, before: new Map(), badgeAt: new Map() }
function takenBefore(id, nodes, edges) {
  const notes = noteHeightsVersion()
  if (takenCache.nodes !== nodes || takenCache.edges !== edges || takenCache.notes !== notes) {
    const byId = new Map(nodes.map(n => [n.id, n]))
    const nodeOf = nid => {
      const n = byId.get(nid)
      return n?.measured?.width
        ? { measured: n.measured, internals: { positionAbsolute: n.position }, lane: n.type === 'lane', data: n.data }
        : null
    }
    const cards = nodes.filter(n => n.type === 'awsNode' && n.measured?.width && n.position)
    const nodeRects = cards.map(n => ({ x: n.position.x, y: n.position.y, w: n.measured.width, h: n.measured.height + getNoteHeight(n.id) }))
    const gaps = laneGaps(nodes.filter(n => n.type === 'lane').map(n => ({ id: n.id, x: n.position.x, y: n.position.y, w: n.width, h: n.height })))
    const before = new Map(), taken = [], badgeAt = new Map(), badges = [], jobs = []
    for (const e of edges) {
      before.set(e.id, [...taken])
      const sourceNode = nodeOf(e.source), targetNode = nodeOf(e.target)
      if (!sourceNode || !targetNode) continue
      const obstacles = cards.filter(n => n.id !== e.source && n.id !== e.target)
        .map(n => ({ x: n.position.x, y: n.position.y, w: n.measured.width, h: n.measured.height + getNoteHeight(n.id) }))
      const r = routeEdge({
        taken: [...taken], id: e.id, source: e.source, target: e.target, sourceNode, targetNode, nodeOf, edges, obstacles, nodeRects, gaps,
        bend: e.data?.bend, endS: e.data?.ends?.s, endT: e.data?.ends?.t, arrow: e.data?.style?.arrow, label: e.label, description: e.data?.description,
        fallback: { sx: 0, sy: 0, tx: 0, ty: 0 },
      })
      taken.push(...(r.legs || []))
      if (r.hideLabel || !(tagText(e.label, e.data?.description) || e.data?.step != null)) continue
      jobs.push({ e, r, hand: typeof e.data?.labelT === 'number' })
    }
    // The owner's hand-slid badges first, so an auto badge clears all of them
    // (render-svg.js places in the same order).
    for (const { e, r, hand } of [...jobs.filter(j => j.hand), ...jobs.filter(j => !j.hand)]) {
      const box = badgeBox(tagText(e.label, e.data?.description), true)
      const at = hand
        ? pointAlongPath(r.path, Math.min(T_MAX, Math.max(T_MIN, e.data.labelT))) || { x: r.labelX, y: r.labelY }
        : clearBadge(r.path, { x: r.labelX, y: r.labelY }, box, r.labelOff, badges)
      badgeAt.set(e.id, at)
      const s = badgeShift(r.labelOff, box.w, box.h, at.lead)
      badges.push({ ...box, x: at.x + s.dx, y: at.y + s.dy })
    }
    takenCache = { nodes, edges, notes, before, badgeAt }
  }
  return takenCache.before.get(id) || []
}

export function GradientEdge({
  id, source, target, sourceX, sourceY, targetX, targetY, markerEnd, data, label, selected,
}) {
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)
  const lit = !selected && (sourceNode?.selected || targetNode?.selected)
  const { getNodes, getEdges, screenToFlowPosition } = useReactFlow()
  // Stem direction needs the OTHER nodes' geometry, and useInternalNode only
  // covers this edge's two ends, so measured sizes come off the node list.
  const internalById = id => {
    const n = getNodes().find(x => x.id === id)
    return n?.measured?.width
      ? { measured: n.measured, internals: { positionAbsolute: n.position }, lane: n.type === 'lane', data: n.data }
      : null
  }

  // A note is measured after its node paints, and re-wraps whenever the card is
  // resized or the text edited. Subscribing keeps the route honest instead of
  // leaving it computed against a height that has since changed.
  useSyncExternalStore(subscribeNoteHeights, noteHeightsVersion, () => 0)

  const allEdges = getEdges()
  const nodeOf = nid => (nid === source ? sourceNode : nid === target ? targetNode : internalById(nid))
  // Every other service box is something this edge must not run through.
  // A note hangs below its card and React Flow does not measure it, so the box
  // to avoid is the card PLUS whatever the note wraps to: a passing line still
  // goes around another card's note. Only this edge's OWN two notes are open
  // to it, since it runs under them to reach its cards (see attachPoint).
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
  // Every card's box WITH its note, for the badge nudge that keeps a label off
  // a node. The note is opaque and paints over the line, so a badge left on
  // that strip is simply invisible - the nudge has to step past the note, not
  // past the card. A hidden note publishes height 0, so toggling Notes moves
  // the badges back on its own.
  const nodeRects = getNodes()
    .filter(n => n.type === 'awsNode' && n.measured && n.position)
    .map(n => ({ x: n.position.x, y: n.position.y, w: n.measured.width, h: n.measured.height + getNoteHeight(n.id) }))
  // The strips between swimlanes, where a trunk's bus line runs.
  const laneRects = getNodes().filter(n => n.type === 'lane').map(n => ({ id: n.id, x: n.position.x, y: n.position.y, w: n.width, h: n.height }))
  const gaps = laneGaps(laneRects)
  const { path, drawPath, hideLabel, hideArrow, sx, sy, tx, ty, sSide, tSide, labelX, labelY, labelOff } = routeEdge({
    taken: takenBefore(id, getNodes(), allEdges),
    id, source, target, sourceNode, targetNode, nodeOf, edges: allEdges, obstacles, nodeRects, gaps,
    bend, endS, endT, arrow: data?.style?.arrow, label, description: data?.description,
    fallback: { sx: sourceX, sy: sourceY, tx: targetX, ty: targetY },
  })
  // The line's look, from the format panel.
  const st = data?.style || {}
  const c1 = data?.sourceColor || INK
  const c2 = data?.targetColor || INK
  // A lane end gets a solid port on the border, in the lane's colour: the mark
  // that this 1 line stands for every card in the band (render-svg.js draws
  // the same circle, so the exports agree).
  const port = isLaneNode(source) ? { x: sx, y: sy, c: c1 } : isLaneNode(target) ? { x: tx, y: ty, c: c2 } : null
  // Into a sunset node: the badge drops its style and goes flat silver with a
  // red X, whatever badge style the owner picked, so the outdated route reads.
  const sunset = data?.sunset === true
  const gid = `grad-${id}`
  const hasStep = !hideLabel && data?.step != null // a trunk follower carries nothing, the leader has the badge
  // The tag reads the label, else the description cut short; the whole
  // description is the hover (see tag.js).
  const desc = data?.description || ''
  // A trunk follower has no badge of its own: the leader's badge is the message.
  const tag = hideLabel ? '' : tagText(label, desc)

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
  // The badge text is edited where it is drawn: double-click turns it into an
  // input, Enter keeps it, Escape drops it. `draft` null means not editing.
  const editable = typeof data?.onLabelEdit === 'function'
  const [draft, setDraft] = useState(null)
  const endMovable = typeof data?.onEndMove === 'function'
  const bendMovable = typeof data?.onBendMove === 'function'
  // The end and bend dots keep a grabbable screen size at any zoom (a whole
  // diagram fitted on screen sits near 0.4). Only a selected line listens.
  const dot = useStore(s => (selected ? Math.max(14, 18 / s.transform[2]) : 14))
  const ring = dot / 7

  const sideways = side => side === 'left' || side === 'right'
  const square = data?.style?.arrow !== 'straight' && data?.style?.arrow !== 'curved'
  const startBendDrag = e => {
    if (!bendMovable || e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    let last = null
    // A square line's leg moves by how far the pointer went, from where the leg is now.
    const f0 = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    const leg = isElbow(bend) ? elbowHandle(sx, sy, tx, ty, sSide, tSide, bend) : (pointOnPath(path, 0.5) || { x: labelX, y: labelY })
    const move = ev => {
      const p = screenToFlowPosition({ x: ev.clientX, y: ev.clientY })
      const f = square ? { x: leg.x + p.x - f0.x, y: leg.y + p.y - f0.y } : p
      // A square line slides a leg (left, right, up, down); straight and curved ones bend.
      last = square ? elbowFor(sx, sy, tx, ty, sSide, tSide, f.x, f.y) : bendFor(sx, sy, tx, ty, f.x, f.y)
      setDragBend(last)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setDragBend(null)
      const saved = data?.bend
      if (last && JSON.stringify(saved) !== JSON.stringify(last)) data.onBendMove(id, last)
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

  // Double-click the badge to rewrite it. Alt keeps the older gesture, putting
  // a badge that was dragged along its line back at the computed spot.
  // Capture phase, not bubble: React Flow's pane stops a dblclick on its way
  // DOWN (that is how zoom-on-double-click swallows it), so a plain
  // onDoubleClick on the badge never fires. React's own listener sits above the
  // pane, so the capture handler still gets there.
  const startEdit = e => {
    if (draft != null) return // already typing - the click belongs to the input
    e.stopPropagation()
    if (e.altKey || !editable) { if (movable) data.onLabelMove(id, null); return }
    setDraft(label || tag || '')
  }
  const endEdit = keep => {
    const next = draft
    setDraft(null)
    if (keep && next != null && next.trim() !== (label || '')) data.onLabelEdit(id, next.trim())
  }

  const startDrag = e => {
    if (!movable || e.button !== 0 || draft != null) return
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
  const auto = takenCache.badgeAt.get(id)
  const ax = onPath ? onPath.x : auto ? auto.x : labelX
  const ay = onPath ? onPath.y : auto ? auto.y : labelY
  // A paired line's badge hangs off the line on a short leader, on the pair's
  // outside. The shift uses the same estimated box as the placement pass and
  // render-svg.js, so the canvas and the export put every badge in 1 spot.
  const box = badgeBox(tag, true)
  const { dx, dy } = badgeShift(labelOff, box.w, box.h, onPath ? 0 : auto?.lead)
  const bx = ax + dx
  const by = ay + dy
  const lineStroke = data?.sunsetLine ? SUNSET.line : (st.stroke || `url(#${gid})`)

  return (
    <>
      <defs>
        <linearGradient id={gid} gradientUnits="userSpaceOnUse" x1={sx} y1={sy} x2={tx} y2={ty}>
          <stop offset="0%" stopColor={c1} />
          <stop offset="100%" stopColor={c2} />
        </linearGradient>
      </defs>
      <g>
      {selected && <path className="sd-edge-halo" d={drawPath} fill="none" stroke={c1} strokeWidth={10} strokeOpacity={0.18} strokeLinecap="round" pointerEvents="none" />}
      {/* Clicking a card lights every line in and out of it, so the owner can
          read a card's traffic at a glance: a quiet 4 px wash, no shadow. */}
      {lit && <path className="sd-edge-glow" d={drawPath} fill="none" stroke={`url(#${gid})`} strokeWidth={4} strokeOpacity={0.22} strokeLinecap="round" pointerEvents="none" />}
      {/* A picked stroke replaces the gradient outright rather than tinting it.
          The gradient's whole job is to say which node a line came FROM and
          which it goes TO; once the owner has chosen a colour, that is the
          statement, and a fade between it and a brand colour says neither. */}
      <BaseEdge id={id} path={drawPath} markerEnd={hideArrow ? undefined : markerEnd} style={data?.sunsetLine ? {
        // A line touching a sunset card, in or out, is the path on its way out:
        // flat light silver at 3/4 strength, and nothing the panel picked -
        // colour, width, dash or opacity - reaches it. Grey, always.
        stroke: SUNSET.line, strokeWidth: 1.5, strokeDasharray: undefined, opacity: 0.75,
      } : {
        stroke: st.stroke || `url(#${gid})`,
        // No +1 while selected. The panel is only ever open on a selected line,
        // so thickening it there meant picking 1px painted 2 and picking 2px
        // painted 3 - the one row in the panel that could never show the value
        // it claimed. The halo above already says which line is selected.
        strokeWidth: st.bw || 1.5,
        strokeDasharray: dashArray(st.bs, st.bw || 1.5) || undefined,
        opacity: st.opacity == null ? undefined : st.opacity / 100,
      }} />
        {labelOff && (tag || hasStep) && <line className="sd-edge-lead" x1={ax} y1={ay} x2={bx} y2={by} stroke={lineStroke} strokeWidth={1} strokeOpacity={0.7} pointerEvents="none" />}
        {port && <circle className="sd-lane-port" cx={port.x} cy={port.y} r={5} fill={port.c} stroke="#fff" strokeWidth={1.5} pointerEvents="none" />}
        <FlowDot edgeId={id} path={path} color={c1} />
      </g>
      {(tag || hasStep || ((endMovable || bendMovable) && selected)) && (
        <EdgeLabelRenderer>
          {(tag || hasStep) && (
            <div
              className={`sd-edge-badge nodrag nopan${movable ? ' is-movable' : ''}${dragT != null ? ' is-dragging' : ''}`}
              onPointerDown={startDrag}
              onDoubleClickCapture={movable || editable ? startEdit : undefined}
              data-tip={draft == null ? desc || undefined : undefined}
              title={!desc && (movable || editable) ? 'Double-click to rewrite; drag along the line to move it; alt+double-click puts it back' : undefined}
              style={{
                transform: `translate(-50%, -50%) translate(${bx}px, ${by}px)`,
                '--c1': c1, '--c2': c2,
                ...(sunset ? { color: SUNSET.ink, background: SUNSET.tint, border: `1.5px solid ${SUNSET.border}`, textShadow: 'none' } : {}),
              }}
            >
              {sunset && <SunsetX size={12} />}
              {hasStep && <span className="sd-step-chip">{data.step}</span>}
              {draft != null ? (
                <input
                  autoFocus className="sd-edge-badge-input" value={draft} maxLength={EDGE_LABEL_MAX}
                  size={Math.max(6, draft.length + 1)}
                  onChange={e => setDraft(e.target.value)}
                  onPointerDown={e => e.stopPropagation()}
                  onBlur={() => endEdit(true)}
                  onKeyDown={e => {
                    e.stopPropagation() // the canvas reads Delete and Cmd+Z
                    if (e.key === 'Enter') { e.preventDefault(); endEdit(true) }
                    if (e.key === 'Escape') { e.preventDefault(); endEdit(false) }
                  }}
                />
              ) : tag && <span>{tag}</span>}
            </div>
          )}
          {endMovable && selected && [['s', sx, sy, data?.sourceColor], ['t', tx, ty, data?.targetColor]].map(([which, x, y, color]) => (
            <div key={which} className="sd-edge-end nodrag nopan" onPointerDown={e => startEndDrag(e, which)}
              onDoubleClick={e => { e.stopPropagation(); data.onEndMove(id, which, null) }}
              title="Drag to another spot on the box; double-click to reset"
              style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`, width: dot, height: dot, borderRadius: '50%', background: color || '#6b7280', border: `${ring}px solid #fff`, boxShadow: `0 0 0 ${ring / 2}px rgba(0,0,0,0.25)`, cursor: 'grab', pointerEvents: 'all', zIndex: 2 }} />
          ))}
          {bendMovable && selected && (() => {
            const mid = isElbow(bend) ? elbowHandle(sx, sy, tx, ty, sSide, tSide, bend)
              : bend ? bendPoint(sx, sy, tx, ty, bend) : (pointOnPath(path, 0.5) || { x: labelX, y: labelY })
            // Unbent, the handle rests at the midpoint - exactly where the badge
            // sits, and the 2 swallowed each other's clicks: the dot took the
            // second click of a double-click, so the badge never saw one. While
            // there is no bend the dot sits clear below the badge.
            // A moved square line's dot slides along its own leg, off the badge.
            const gap = Math.max(20, dot * 1.4)
            const h = isElbow(bend) ? (Number.isFinite(bend.oy) && !Number.isFinite(bend.ox) ? { x: mid.x + gap, y: mid.y } : { x: mid.x, y: mid.y + gap })
              : bend ? mid : { x: mid.x, y: mid.y + gap }
            return (
              <div className="sd-edge-bend nodrag nopan" onPointerDown={startBendDrag}
                onDoubleClick={e => { e.stopPropagation(); data.onBendMove(id, null) }}
                title={square ? 'Drag to move the line up, down, left or right; double-click to reset' : 'Drag to bend the line; double-click to straighten'}
                style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${h.x}px, ${h.y}px)`, width: dot, height: dot, borderRadius: '50%', background: 'rgba(255,255,255,0.9)', border: `${ring}px solid ${c1}`, boxShadow: `0 0 0 ${ring}px #fff`, cursor: square ? (sideways(sSide) && sideways(tSide) ? 'ew-resize' : !sideways(sSide) && !sideways(tSide) ? 'ns-resize' : 'move') : 'move', pointerEvents: 'all', zIndex: 3 }} />
            )
          })()}
        </EdgeLabelRenderer>
      )}
    </>
  )
}

// The red X that marks something outdated: on the badge of every edge that
// touches a sunset card, in or out, never on the card itself. Sits on the top-right corner of its parent.
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
// Chrome edge leaves Chrome blue. A soft halo round a solid white-ringed core,
// big enough to catch the eye on a full diagram (owner 2026-10-08): the dot is
// the 1 thing moving, so it has to be the 1 thing you notice.
// Whether this line is the one carrying the current right now, and how far
// along it the dot has got. null the rest of the cycle.
const dotsFor = (order, edgeId, p) => {
  const list = order ? order.split('\u0000').map(s => { const a = s.endsWith('\u0001'); return { id: a ? s.slice(0, -1) : s, async: a } }) : []
  const i = list.findIndex(e => e.id === edgeId)
  // t: the big step dot, null while the current is on another line.
  // small: the ambient dots this line carries the whole time.
  return { t: i < 0 ? null : dotAt(p, list, i), small: i < 0 ? [] : ambientAt(p, list, i) }
}

// One beat at a time: the cycle gives each beat its own slot, in the order the
// Steps badges number the lines, and this line draws nothing until its beat
// comes round. A line marked async shares the beat of the line before it, so
// a fan-out of independent lines leaves the card together (src/flowClock.js).
const NO_DASH = { strokeDasharray: 'none', animation: 'none' }

function FlowDot({ edgeId, path, color }) {
  // The line order IS the step order, with a trailing marker on each async
  // line. Pulled out as a stable string because the edges array itself is
  // rebuilt every frame.
  const order = useStore(s => s.edges.map(e => e.id + (e.data?.async ? '\u0001' : '')).join('\u0000'))
  const [{ t, small }, setDots] = useState(() => dotsFor(order, edgeId, currentPhase()))

  useEffect(() => {
    if (!motionAllowed()) return
    return subscribe(p => setDots(dotsFor(order, edgeId, p)))
  }, [order, edgeId])

  // Ease in and out of the endpoints so a dot appears to leave the source box
  // and arrive at the target, rather than popping through both of them.
  const fadeAt = x => Math.min(1, Math.min(x, 1 - x) / 0.12)
  const pt = t == null ? null : pointOnPath(path, t)

  return (
    <g className="sd-flow-dot" pointerEvents="none">
      {/* The ambient current: small and soft, the look every line had before
          the single step dot, under it so the big one always reads on top. */}
      {/* Every fully lit dot of the line rides in 1 halo path and 1 core
          path (round caps on zero-length moves), so 5000 dots stay 2 nodes a
          line instead of 10000 circles; only the few fading in or out at
          the cards keep a circle of their own. */}
      {(() => {
        let d = ''
        const fading = []
        small.forEach((a, k) => {
          const sp = pointOnPath(path, a)
          if (!sp) return
          if (fadeAt(a) < 1) fading.push(
            <g key={k} opacity={fadeAt(a)}>
              <circle cx={sp.x} cy={sp.y} r={5} fill={color} opacity={0.18} />
              <circle cx={sp.x} cy={sp.y} r={2.4} fill={color} />
            </g>
          )
          else d += `M${sp.x.toFixed(1)} ${sp.y.toFixed(1)}h0`
        })
        return <>
          {/* Inline, to beat React Flow's dash on every path of an animated
              edge: dashed, most of the zero-length dots would vanish. */}
          {d && <path d={d} stroke={color} strokeWidth={10} strokeLinecap="round" opacity={0.18} fill="none" style={NO_DASH} />}
          {d && <path d={d} stroke={color} strokeWidth={4.8} strokeLinecap="round" fill="none" style={NO_DASH} />}
          {fading}
        </>
      })()}
      {pt && (
        <g opacity={fadeAt(t)}>
          <circle cx={pt.x} cy={pt.y} r={16} fill={color} opacity={0.25} />
          <circle cx={pt.x} cy={pt.y} r={7} fill={color} stroke="#fff" strokeWidth={2} />
        </g>
      )}
    </g>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- edgeTypes must live alongside GradientEdge for <ReactFlow edgeTypes={edgeTypes}>
export const edgeTypes = { gradient: GradientEdge }
