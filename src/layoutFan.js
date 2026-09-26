// Fan-out arrangement: a tree that spreads to the right from the start node.
// Every parent's children sit just to its right, packed as tightly as their
// own subtrees allow, and bowed on a shallow arc so the middle branches reach
// further right than the outer ones - the shape of an open hand fan. Columns
// never line up across the tree, and nothing is spaced further than it has to
// be, so Fit keeps the cards readable. This is the spread-out sibling of
// layout.js, which packs tight rows; the 2 never share logic on purpose.
const NODE_W = 190, NODE_H = 180
const IMG_W = 240, IMG_H = 225
const COL_GAP = 130  // between a parent's right edge and its nearest child - clears a badge
const ROW_GAP = 40   // between neighbouring subtrees, top to bottom
const BULGE = 110    // how much further right the middle child sits than the outer ones
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
  const seen = new Set()
  const children = new Map(nodes.map(n => [n.id, []]))
  const roots = []
  const visit = root => {
    roots.push(root)
    seen.add(root)
    const q = [root]
    while (q.length) {
      const id = q.shift()
      for (const c of out.get(id)) {
        if (seen.has(c)) continue
        seen.add(c)
        children.get(id).push(c)
        q.push(c)
      }
    }
  }
  visit(startNodeId(nodes, edges))
  nodes.forEach(n => { if (!seen.has(n.id)) visit(n.id) })

  const size = new Map(nodes.map(n => [n.id, sizeOf(n)]))

  // Lay a subtree out in its own box, top-left at 0,0. Returns the box, the
  // centre of its root, and every node's centre inside it.
  const layoutSub = id => {
    const { w, h } = size.get(id)
    const kids = children.get(id).map(layoutSub)
    if (!kids.length) return { w, h, cy: h / 2, at: [{ id, x: w / 2, y: h / 2 }] }

    // Stack the children's boxes top to bottom, as close as they get.
    let top = 0
    const tops = kids.map(k => { const t = top; top += k.h + ROW_GAP; return t })
    const kidsH = top - ROW_GAP
    const first = tops[0] + kids[0].cy, last = tops[kids.length - 1] + kids[kids.length - 1].cy
    const mid = (first + last) / 2, half = (last - first) / 2

    // The parent sits level with the middle of its children. If it is taller
    // than all of them together, they drop to sit level with it instead.
    const shift = Math.max(0, h / 2 - mid)
    const cy = mid + shift
    const at = [{ id, x: w / 2, y: cy }]
    let width = w
    kids.forEach((k, i) => {
      // The arc: children near the middle reach further right than the ends.
      const off = half ? (tops[i] + k.cy - mid) / half : 0
      const dx = w + COL_GAP + BULGE * (1 - off * off)
      const dy = tops[i] + shift
      k.at.forEach(p => at.push({ id: p.id, x: p.x + dx, y: p.y + dy }))
      width = Math.max(width, dx + k.w)
    })
    return { w: width, h: Math.max(kidsH + shift, cy + h / 2), cy, at }
  }

  // One fan per root, stacked top to bottom so a node the start cannot reach
  // never lands inside the fan.
  const centers = new Map()
  let treeTop = 0
  roots.forEach(root => {
    const sub = layoutSub(root)
    sub.at.forEach(p => centers.set(p.id, { x: p.x, y: p.y + treeTop }))
    treeTop += sub.h + TREE_GAP
  })

  return nodes.map(n => {
    const c = centers.get(n.id), { w, h } = size.get(n.id)
    return { ...n, position: { x: c.x - w / 2, y: c.y - h / 2 } }
  })
}
