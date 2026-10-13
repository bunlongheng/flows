// The bottom-left legend: 1 row for each look the diagram actually uses, so a
// reader knows what red, green and a dash mean. Shared by the canvas
// (components/Legend.jsx) and the export (lib/render-svg.js), which draw the
// same rows in the same order. A diagram using none of them draws no legend.
import { SUNSET, NEW } from './sunset.js'

export const LEGEND_ROWS = {
  path: { label: 'Path', kind: 'line' },
  dashed: { label: 'Interim or optional', kind: 'dash' },
  removed: { label: 'Today, being removed', kind: 'removed' },
  sunset: { label: 'Decommissioned', kind: 'x' },
  new: { label: 'New component', kind: 'new' },
}

/**
 * The row keys for a diagram, in order. `nodes` [{ sunset, new }], `edges`
 * [{ style, sunset }] where an edge's sunset means it touches a sunset card.
 */
export function legendRows(nodes = [], edges = []) {
  const sunset = nodes.some(n => n.sunset === true)
  const fresh = nodes.some(n => n.new === true && n.sunset !== true)
  const dashed = edges.some(e => !e.sunset && (e.style?.bs === 'dashed' || e.style?.bs === 'dotted'))
  const removed = edges.some(e => e.sunset)
  if (!sunset && !fresh && !dashed) return []
  return ['path', dashed && 'dashed', removed && 'removed', sunset && 'sunset', fresh && 'new'].filter(Boolean)
}

export const LEGEND_INK = { line: '#374151', dash: '#9ca3af', removed: SUNSET.line, x: SUNSET.x, xTint: SUNSET.tint, xBorder: SUNSET.border, new: NEW.border }
