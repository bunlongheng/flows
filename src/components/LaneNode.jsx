import { memo, useEffect, useState } from 'react'
import { Handle, Position, useStore } from '@xyflow/react'
import { subscribe, glowAt, motionAllowed } from '../flowClock'
import { LANE_INK, LANE_TITLE } from '../lanes.js'
import { hexToRgba } from '../style.js'

// A swimlane on the canvas: the band under the cards that render-svg.js draws
// in the under layer, same tint, border and title. It lets every pointer event
// through (see .react-flow__node-lane), so panning and box selection work over
// it. Lanes are configuration, so there is nothing to edit here; the title
// size comes from the payload too (size, px), the same number the SVG uses.
export const LaneNode = memo(function LaneNode({ id, data, width, height }) {
  const ink = data.color || LANE_INK
  // 2 to 4 sections across the band, each its own band with its own title and
  // tint, LANE_GAP apart for the same visual separation 2 lanes get (src/lanes.js).
  const sections = data.sections || []
  const split = sections.length >= 2
  // The arrival glow, as AwsNode paints it: the band lights only while the
  // single current is crossing into it, and is dark the rest of the cycle
  // (src/flowClock.js). The targets come out as a stable string, as AwsNode
  // does it - the edges array itself is rebuilt every frame.
  const targets = useStore(s => s.edges.map(e => e.target).join('\u0000'))
  const [glow, setGlow] = useState(0)
  useEffect(() => {
    if (!motionAllowed()) return
    const list = targets ? targets.split('\u0000').map(target => ({ target })) : []
    return subscribe(p => setGlow(Math.round(glowAt(p, list, id) * 50) / 50))
  }, [targets, id])
  // A split band lights its sections 1 by 1, so the gap between them stays dark
  // instead of 1 halo drawn around the whole row.
  const halo = c => (glow ? `0 0 0 ${(3 * glow).toFixed(1)}px ${hexToRgba(c, 0.45 * glow)}, 0 0 ${Math.round(22 * glow)}px ${hexToRgba(c, 0.7 * glow)}` : undefined)
  return (
    <div className="sd-lane" style={{
      width, height, borderColor: hexToRgba(ink, 0.35), boxShadow: split ? undefined : halo(ink),
      // A split band draws nothing of its own: its sections are the bands, so
      // the space between them reads as a gap and not as a box inside a box.
      // No border either, or the sections would sit 1.5 px in from the SVG.
      background: split ? 'transparent' : hexToRgba(ink, 0.05),
      borderWidth: split ? 0 : undefined,
    }}>
      {/* Invisible handles so an edge can end on the lane ("lane:<id>"); GradientEdge routes to the border itself. */}
      <Handle type="target" position={Position.Top} style={{ opacity: 0, pointerEvents: 'none' }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, pointerEvents: 'none' }} />
      {split ? sections.map(s => {
        const sink = s.color || ink
        return (
          <div key={s.id} className="sd-lane sd-lane-section" style={{
            left: s.x, top: s.y, width: s.w, height: s.h,
            background: hexToRgba(sink, 0.05), borderColor: hexToRgba(sink, 0.35), boxShadow: halo(sink),
          }}>
            <div className="sd-lane-title" style={{ color: sink, fontSize: data.size || LANE_TITLE }}>{s.title || ''}</div>
          </div>
        )
      }) : <div className="sd-lane-title" style={{ color: ink, fontSize: data.size || LANE_TITLE }}>{data.title || ''}</div>}
    </div>
  )
})
