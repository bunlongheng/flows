import { useState, useEffect, useSyncExternalStore } from 'react'
import { BaseEdge, EdgeLabelRenderer, useInternalNode, useReactFlow } from '@xyflow/react'
import { getNoteHeight, subscribeNoteHeights, noteHeightsVersion } from './noteEditContext'
import { subscribe, currentPhase, motionAllowed, offsetFor } from '../flowClock'
import { SUNSET, INK } from '../sunset.js'
import { dashArray } from '../style.js'
import { routeEdge, bendPoint, bendFor, nearestEnd, T_MIN, T_MAX } from '../edgeGeometry.js'
import { laneGaps, isLaneNode, laneAt, laneClip } from '../lanes.js'
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
      ? { measured: n.measured, internals: { positionAbsolute: n.position }, lane: n.type === 'lane' }
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
  // Every card's box, for the badge nudge that keeps a label off a node.
  const nodeRects = getNodes()
    .filter(n => n.type === 'awsNode' && n.measured && n.position)
    .map(n => ({ x: n.position.x, y: n.position.y, w: n.measured.width, h: n.measured.height }))
  // The strips between swimlanes, where a trunk's bus line runs.
  const laneRects = getNodes().filter(n => n.type === 'lane').map(n => ({ id: n.id, x: n.position.x, y: n.position.y, w: n.width, h: n.height }))
  const gaps = laneGaps(laneRects)
  const { path, drawPath, hideLabel, hideArrow, sx, sy, tx, ty, labelX, labelY } = routeEdge({
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
  // A lane edge is drawn only in the gaps and in its card's own lane: the lanes
  // it passes on the way are cut out, so a band shows no line it is not part of.
  const clip = port ? laneClip(laneRects, isLaneNode(source) ? [source, laneAt(laneRects, tx, ty)] : [target, laneAt(laneRects, sx, sy)]) : null
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
  const bx = onPath ? onPath.x : labelX
  const by = onPath ? onPath.y : labelY

  return (
    <>
      <defs>
        <linearGradient id={gid} gradientUnits="userSpaceOnUse" x1={sx} y1={sy} x2={tx} y2={ty}>
          <stop offset="0%" stopColor={c1} />
          <stop offset="100%" stopColor={c2} />
        </linearGradient>
        {clip && <clipPath id={`clip-${id}`}><path d={clip} clipRule="evenodd" /></clipPath>}
      </defs>
      <g clipPath={clip ? `url(#clip-${id})` : undefined}>
      {selected && <path className="sd-edge-halo" d={drawPath} fill="none" stroke={c1} strokeWidth={10} strokeOpacity={0.18} strokeLinecap="round" pointerEvents="none" />}
      {/* Clicking a card lights every line in and out of it, so the owner can
          read a card's traffic at a glance; the glow goes with the selection. */}
      {lit && <path className="sd-edge-glow" d={drawPath} fill="none" stroke={`url(#${gid})`} strokeWidth={7} strokeOpacity={0.55} strokeLinecap="round" pointerEvents="none" style={{ filter: `drop-shadow(0 0 6px ${c1}) drop-shadow(0 0 6px ${c2})` }} />}
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
              style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`, width: 14, height: 14, borderRadius: '50%', background: color || '#6b7280', border: '2px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,0.25)', cursor: 'grab', pointerEvents: 'all', zIndex: 2 }} />
          ))}
          {bendMovable && selected && (() => {
            const mid = bend ? bendPoint(sx, sy, tx, ty, bend) : (pointOnPath(path, 0.5) || { x: labelX, y: labelY })
            // Unbent, the handle rests at the midpoint - exactly where the badge
            // sits, and the 2 swallowed each other's clicks: the dot took the
            // second click of a double-click, so the badge never saw one. While
            // there is no bend the dot sits clear below the badge.
            const h = bend ? mid : { x: mid.x, y: mid.y + 20 }
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
