// Which cards get a "Start here" pill. The first is the source of the first
// edge (robust even for a closed loop), else a card nothing arrives at, else
// card 0. Then every other card that nothing arrives at and that feeds the
// same target under the same label is a start too: 5 devices opening a link
// in 1 browser are 5 places the flow begins, not 1 phone and 4 bystanders.
// Shared by the canvas (buildMarkers), the auto layout and the SVG/GIF renderer.
export function startNodeIds(nodes, edges) {
  if (!nodes.length) return []
  const has = id => nodes.some(n => n.id === id)
  const incoming = new Set(edges.map(e => e.target))
  const first = edges[0]?.source && has(edges[0].source) ? edges[0].source
    : (nodes.find(n => !incoming.has(n.id)) || nodes[0]).id
  const lead = edges.find(e => e.source === first)
  if (!lead) return [first]
  const tag = (lead.label || '').trim()
  const twin = e => e.target === lead.target && (e.label || '').trim() === tag
  const peers = nodes.filter(n => n.id !== first && !incoming.has(n.id) && edges.some(e => e.source === n.id && twin(e)))
  return [first, ...peers.map(n => n.id)]
}
