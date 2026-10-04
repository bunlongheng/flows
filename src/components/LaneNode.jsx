import { memo } from 'react'
import { LANE_INK, LANE_TITLE } from '../lanes.js'
import { hexToRgba } from '../style.js'

// A swimlane on the canvas: the band under the cards that render-svg.js draws
// in the under layer, same tint, border and title. It lets every pointer event
// through (see .react-flow__node-lane), so panning and box selection work over
// it. Lanes are configuration, so there is nothing to edit here; the title
// size comes from the payload too (size, px), the same number the SVG uses.
export const LaneNode = memo(function LaneNode({ data, width, height }) {
  const ink = data.color || LANE_INK
  return (
    <div className="sd-lane" style={{ width, height, background: hexToRgba(ink, 0.05), borderColor: hexToRgba(ink, 0.35) }}>
      <div className="sd-lane-title" style={{ color: ink, fontSize: data.size || LANE_TITLE }}>{data.title || ''}</div>
    </div>
  )
})
