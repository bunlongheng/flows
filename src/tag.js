// A line's tag: what the badge on a line says, and what hovering it says.
//
// An edge has a short label and, optionally, a longer description. The tag
// reads the label when there is one, else the description cut short at a
// word, so a line with only a description still has a tag on it. The whole
// description is the hover, on the canvas only: the SVG has no hover.
export const EDGE_DESC_MAX = 300
export const cleanDesc = v => (typeof v === 'string' ? v.trim().slice(0, EDGE_DESC_MAX) : '')

export const TAG_MAX = 28
export function tagText(label, description) {
  const l = typeof label === 'string' ? label.trim() : ''
  if (l) return l
  const d = cleanDesc(description)
  if (d.length <= TAG_MAX) return d
  const cut = d.slice(0, TAG_MAX)
  const sp = cut.lastIndexOf(' ')
  return (sp > TAG_MAX / 2 ? cut.slice(0, sp) : cut).replace(/[\s,.;:]+$/, '') + '\u2026'
}
