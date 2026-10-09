// How big every card draws, chosen per diagram in the Current panel and saved
// as view_state.sizing (owner 2026-10-09: "Match will be same for all, Auto
// mean the more lines in and out the bigger 10%, Custom will be those I set
// manually"). The canvas, the SVG/GIF renderer and the MCP all read it here.
//
//   match  - every card the default square (a picture card its 240 x 225)
//   auto   - 10% bigger for every line in or out past the first, up to 1.5x
//   custom - the owner's hand sizes (node.size); a card without one stays default
//
// A row saved before the setting existed keeps what it looked like: custom
// when any card carries a hand size, else match.
export const SIZINGS = ['match', 'auto', 'custom']
const AUTO_STEP = 0.1, AUTO_MAX = 1.5

export const sizingOf = (view, nodes) =>
  SIZINGS.includes(view?.sizing) ? view.sizing : (nodes || []).some(n => n?.size) ? 'custom' : 'match'

/** view_state.sizing for storage: only a real choice is kept. */
export const cleanSizing = (v) => (SIZINGS.includes(v) ? { sizing: v } : {})

// Lines in + out per card. A lane end (`lane:<id>`) is not a card.
export function lineCounts(edges) {
  const out = new Map()
  for (const e of edges || []) for (const id of [e?.source, e?.target]) if (id) out.set(id, (out.get(id) || 0) + 1)
  return out
}

/** The { w, h } a card draws at, or null for its default box. */
export function cardSize(node, mode, lines = 0, base = { w: 180, h: 180 }) {
  if (mode === 'custom') return node?.size && Number.isFinite(node.size.w) && Number.isFinite(node.size.h) ? node.size : null
  if (mode !== 'auto') return null
  const k = Math.min(AUTO_MAX, 1 + AUTO_STEP * Math.max(0, lines - 1))
  return k === 1 ? null : { w: Math.round(base.w * k), h: Math.round(base.h * k) }
}
