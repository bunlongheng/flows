// The bottom-left legend: 1 row for each look the diagram actually uses, so a
// reader knows what red, green and a dash mean. Shared by the canvas
// (components/Legend.jsx) and the export (lib/render-svg.js), which draw the
// same rows in the same order. A diagram using none of them draws no legend.
import { SUNSET, NEW, CALLOUT } from './sunset.js'

export const LEGEND_ROWS = {
  path: { label: 'Path', kind: 'line' },
  dashed: { label: 'Interim or optional', kind: 'dash' },
  removed: { label: 'Today, being removed', kind: 'removed' },
  sunset: { label: 'Decommissioned', kind: 'x' },
  new: { label: 'New component', kind: 'new' },
  callout: { label: 'Important date', kind: 'callout' },
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
  // A pinned callout explains itself, so it gets no legend row (owner 2026-10-13).
  if (!sunset && !fresh && !dashed) return []
  return ['path', dashed && 'dashed', removed && 'removed', sunset && 'sunset', fresh && 'new'].filter(Boolean)
}

export const LEGEND_INK = { line: '#374151', dash: '#9ca3af', removed: SUNSET.line, x: SUNSET.x, xTint: SUNSET.tint, xBorder: SUNSET.border, new: NEW.border, callout: CALLOUT.fill }

// Custom rows (owner 2026-11-15): view_state.legend, sent with a create, the
// MCP update_flow view or PATCH { legend }. Each is { label, color?, kind? },
// drawn after the automatic rows; any custom row shows the legend on its own.
export const LEGEND_KINDS = ['box', 'line', 'dash', 'dot']
export const LEGEND_MAX = 12
export const LEGEND_LABEL_MAX = 60
const HEX = /^#[0-9a-fA-F]{6}$/

/** The custom rows of `v`, cleaned: a label is required, the rest falls back. Always an array. */
export const cleanLegend = (v) => (Array.isArray(v) ? v : [])
  .map((r) => ({ label: String(r?.label ?? '').replace(/\s+/g, ' ').trim().slice(0, LEGEND_LABEL_MAX), color: r?.color, kind: r?.kind }))
  .filter((r) => r.label)
  .slice(0, LEGEND_MAX)
  .map(({ label, color, kind }) => ({ label, ...(HEX.test(color) ? { color } : {}), ...(LEGEND_KINDS.includes(kind) && kind !== 'box' ? { kind } : {}) }))

/** Every row the legend draws, as { label, kind, color? }: the automatic keys, then the custom rows. */
export const legendList = (keys = [], custom = []) => [
  ...keys.map((k) => ({ label: LEGEND_ROWS[k].label, kind: LEGEND_ROWS[k].kind })),
  ...cleanLegend(custom).map((r) => ({ label: r.label, kind: `custom-${r.kind || 'box'}`, color: r.color || LEGEND_INK.line })),
]
