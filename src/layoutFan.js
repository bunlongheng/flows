// Fan-out arrangement: a radial tree that spreads from the start node. The
// start sits at the hub, each depth is a ring around it, and every subtree
// owns a wedge of the fan sized by how many leaves it has, so branches leave
// the hub at angles and never cross. This is the spread-out sibling of
// layout.js, which packs tight rows; the 2 never share logic on purpose.
const NODE_W = 190, NODE_H = 180
const IMG_W = 240, IMG_H = 225
const SPREAD = Math.PI * 200 / 180   // the whole fan opens 200 degrees, facing right
const MAX_SLOT = Math.PI / 4          // a leaf never takes more than 45 degrees
const RING_GAP = 170  // between a ring and the next - clears a badge on the edge
const ARC_GAP = 60    // between neighbouring cards on the same ring
const TREE_GAP = 120  // between the start tree and anything it cannot reach

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

  const size = new Map(nodes.map(n => [n.id, sizeOf(n)]))
  const leaves = new Map()
  const countLeaves = id => {
    const kids = children.get(id)
    const n = kids.length ? kids.reduce((s, k) => s + countLeaves(k), 0) : 1
    leaves.set(id, n)
    return n
  }

  // One fan per root, laid out around its own hub, then stacked top to
  // bottom so a node the start cannot reach never lands inside the fan.
  const centers = new Map()
  let treeTop = 0
  roots.forEach(root => {
    countLeaves(root)
    // Every leaf gets the same slice of the fan; a small tree opens wide but
    // never past MAX_SLOT per leaf, a big one squeezes and pushes rings out.
    const slot = Math.min(MAX_SLOT, SPREAD / leaves.get(root))

    // Ring radii: far enough from the previous ring to clear the cards and a
    // badge, and far enough out that 2 neighbours a slot apart do not touch.
    const ringSize = []
    const walk = id => { const d = depth.get(id); ringSize[d] = Math.max(ringSize[d] || 0, Math.max(size.get(id).w, size.get(id).h)); children.get(id).forEach(walk) }
    walk(root)
    const radius = [0]
    for (let d = 1; d < ringSize.length; d++) {
      const clearPrev = radius[d - 1] + ringSize[d - 1] / 2 + RING_GAP + ringSize[d] / 2
      const clearNext = (ringSize[d] + ARC_GAP) / (2 * Math.sin(slot / 2))
      radius[d] = Math.max(clearPrev, clearNext)
    }

    // Each subtree owns a wedge, its node at the wedge's middle angle.
    const local = new Map()
    const place = (id, a0) => {
      const span = leaves.get(id) * slot
      const a = a0 + span / 2, r = radius[depth.get(id)]
      local.set(id, { x: r * Math.cos(a), y: r * Math.sin(a) })
      let cursor = a0
      children.get(id).forEach(k => { place(k, cursor); cursor += leaves.get(k) * slot })
    }
    place(root, -(leaves.get(root) * slot) / 2)

    // Shift this fan so its box starts at the left edge, under the last one.
    let minX = Infinity, minY = Infinity, maxY = -Infinity
    local.forEach((c, id) => {
      const { w, h } = size.get(id)
      minX = Math.min(minX, c.x - w / 2); minY = Math.min(minY, c.y - h / 2); maxY = Math.max(maxY, c.y + h / 2)
    })
    local.forEach((c, id) => centers.set(id, { x: c.x - minX, y: c.y - minY + treeTop }))
    treeTop += maxY - minY + TREE_GAP
  })

  return nodes.map(n => {
    const c = centers.get(n.id), { w, h } = size.get(n.id)
    return { ...n, position: { x: c.x - w / 2, y: c.y - h / 2 } }
  })
}
