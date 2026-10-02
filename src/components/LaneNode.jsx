import { memo, useState } from 'react'
import { NodeResizeControl } from '@xyflow/react'
import { LANE_INK, LANE_MIN_H } from '../lanes.js'
import { hexToRgba } from '../style.js'

// A swimlane on the canvas: the band under the cards that render-svg.js draws
// in the under layer, same tint, rule and title. The band itself lets every
// pointer event through (see .react-flow__node-lane), so panning and box
// selection work over it; the title strip is the drag handle, and the bottom
// edge resizes it when the owner can edit.
export const LaneNode = memo(function LaneNode({ data, width, height }) {
  const ink = data.color || LANE_INK
  const [editing, setEditing] = useState(null) // the title while it is being typed
  const commit = () => { const t = (editing || '').trim(); setEditing(null); if (t && t !== data.title) data.onRename(t) }
  return (
    <div className="sd-lane" style={{ width, height, background: hexToRgba(ink, 0.05) }}>
      <div className="sd-lane-rule" style={{ borderTopColor: hexToRgba(ink, 0.35) }} />
      {editing != null ? (
        <input className="sd-lane-input nodrag nopan" autoFocus value={editing} maxLength={40} style={{ color: ink }}
          onChange={e => setEditing(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commit(); else if (e.key === 'Escape') setEditing(null) }}
          onBlur={commit} />
      ) : (
        <div className="sd-lane-title" style={{ color: ink }} title={data.onLive ? 'Drag to move the lane; double-click to rename' : undefined}
          onDoubleClick={data.onRename ? () => setEditing(data.title || '') : undefined}>
          {(data.title || '').toUpperCase()}
          {data.onRemove && <button type="button" className="sd-lane-x nodrag nopan" title="Remove this lane" aria-label="Remove this lane"
            onPointerDown={e => e.stopPropagation()} onClick={data.onRemove}>&times;</button>}
        </div>
      )}
      {data.onLive && <NodeResizeControl position="bottom" variant="line" className="sd-lane-resize" minHeight={LANE_MIN_H}
        onResize={(_, p) => data.onLive({ h: p.height })}
        onResizeEnd={(_, p) => data.onCommit({ h: Math.round(p.height) })} />}
    </div>
  )
})
