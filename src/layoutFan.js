// Fan-out arrangement: a tree that spreads from the start node. Depth is the
// column, every leaf takes a row of its own, and a parent sits at the middle
// of its subtree's rows, so each branch fans out evenly around what it hangs
// off. This is the spread-out sibling of layout.js, which packs tight rows;
// the 2 never share logic on purpose.
const NODE_W = 190, NODE_H = 180
const IMG_W = 240, IMG_H = 225
const COL_GAP = 170  // between a parent's column and its children's - clears a badge
const ROW_GAP = 60   // between neighbouring rows
const TREE_GAP = 120 // between the start tree and anything it cannot reach

const sizeOf = n => ({
  w: n.measured?.width ?? n.data?.size?.w ?? (n.data?.image ? IMG_W : NODE_W),
  h: n.measured?.height ?? n.data?.size?.h ?? (n.data?.image ? IMG_H : NODE_H),
})

// Same rule as layout.js and the Start pill: source of step 1, else a node
// nothing arrives at, else the first node.
function startNodeId(nodes, edges) {
  const has = id => nodes.some(n => n.id === id)
  if (edges[0]?.source && has(edges[0].source)) return edges[0].source
  const incoming = new Set(edges.map(e => e.target))
  return (nodes.find(n => !incoming.has(n.id)) || nodes[0]).id
}

export function layoutFanOut(nodes, edges) {
  if (!nodes.length) return []
  const ids = new Set(nodes.map(n => n.id))
  const out = new Map(nodes.map(n => [n.id, []]))
  edges.forEach(e => { if (ids.has(e.source) && ids.has(e.target) && e.source !== e.target) out.get(e.source).push(e.target) })

  // A spanning forest, breadth first from the start so depth is the shortest
  // route there, then from whatever is still unplaced, in node order.
  const depth = new Map()
  const children = new Map(nodes.map(n => [n.id, []]))
  const roots = []
  const visit = root => {
    roots.push(root)
    depth.set(root, 0)
    const q = [root]
    while (q.length) {
      const id = q.shift()
      for (const c of out.get(id)) {
        if (depth.has(c)) continue
        depth.set(c, depth.get(id) + 1)
        children.get(id).push(c)
        q.push(c)
      }
    }
  }
  visit(startNodeId(nodes, edges))
  nodes.forEach(n => { if (!depth.has(n.id)) visit(n.id) })

  // A column is as wide as its widest card.
  const colW = []
  nodes.forEach(n => { const d = depth.get(n.id); colW[d] = Math.max(colW[d] || 0, sizeOf(n).w) })
  const colX = []
  let x = 0
  colW.forEach((w, d) => { colX[d] = x + w / 2; x += w + COL_GAP })

  const rowH = Math.max(...nodes.map(n => sizeOf(n).h)) + ROW_GAP
  const centers = new Map()
  let cursor = 0
  const place = id => {
    const kids = children.get(id)
    if (!kids.length) {
      centers.set(id, { x: colX[depth.get(id)], y: cursor + rowH / 2 })
      cursor += rowH
      return
    }
    kids.forEach(place)
    const ys = kids.map(k => centers.get(k).y)
    centers.set(id, { x: colX[depth.get(id)], y: (Math.min(...ys) + Math.max(...ys)) / 2 })
  }
  roots.forEach((r, i) => { if (i) cursor += TREE_GAP; place(r) })

  return nodes.map(n => {
    const c = centers.get(n.id), { w, h } = sizeOf(n)
    return { ...n, position: { x: c.x - w / 2, y: c.y - h / 2 } }
  })
}
