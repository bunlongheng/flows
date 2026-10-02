import { useRef } from 'react'
import { clampWidth } from '../panelWidth.js'

// The grab strip on the right edge of a left-hand panel. Drag it and the panel
// follows the pointer; the owner decides how wide the code is.
export function PanelResizer({ width, onWidth }) {
  const start = useRef(null)
  return (
    <div className="sd-panel-resizer" title="Drag to resize"
      onPointerDown={e => { start.current = { x: e.clientX, w: width }; e.currentTarget.setPointerCapture(e.pointerId); e.preventDefault() }}
      onPointerMove={e => { if (start.current) onWidth(clampWidth(start.current.w + e.clientX - start.current.x, window.innerWidth)) }}
      onPointerUp={() => { start.current = null }} onPointerCancel={() => { start.current = null }} />
  )
}
