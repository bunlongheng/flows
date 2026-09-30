// The gallery tile is a real snapshot of the canvas, shrunk to fit: the same
// cards, icons, lines and tags the owner just looked at. Not a redrawing - the
// old minimap hand-painted a square per node and looked like nothing.
//
// React Flow's own export recipe: html-to-image gets the viewport element with
// an OVERRIDE transform that fits every node in a 2:1 frame. The override lives
// only inside the capture, so the owner's real zoom and pan never move.
import { getNodesBounds, getViewportForBounds } from '@xyflow/react'

export const THUMB_W = 448 // the tile is 2:1; captured at 2x so it stays sharp
export const THUMB_H = 224
const SCALE = 2
const PAD = 0.08

// A JPEG data URL, or null when there is nothing to show: no nodes, canvas not
// mounted, or the browser refused the export (tainted canvas, detached node).
export async function makeThumbnail(nodes = []) {
  if (!nodes.length) return null
  const el = document.querySelector('.react-flow__viewport')
  if (!el) return null
  const bounds = getNodesBounds(nodes)
  if (!bounds || !bounds.width || !bounds.height) return null
  const w = THUMB_W * SCALE, h = THUMB_H * SCALE
  // minZoom 0.01 so a sprawling flow still fits; maxZoom 2 so 1 lone card does
  // not fill the whole tile at absurd magnification.
  const vp = getViewportForBounds(bounds, w, h, 0.01, 2, PAD)
  if (!vp) return null
  try {
    const { toCanvas } = await import('html-to-image')
    const canvas = await toCanvas(el, {
      backgroundColor: '#ffffff',
      width: w,
      height: h,
      pixelRatio: 1, // already capturing at SCALE via width/height
      style: { width: `${w}px`, height: `${h}px`, transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})` },
    })
    const out = canvas.toDataURL('image/jpeg', 0.8)
    return out.length > 280_000 ? canvas.toDataURL('image/jpeg', 0.6) : out
  } catch {
    return null
  }
}
