import * as dagre from '@dagrejs/dagre'
import { findService } from './services.js'

// Real node cards are ~150w x ~100h; pad them so dagre leaves room for the
// edge labels that sit BETWEEN nodes.
const NODE_W = 190
const NODE_H = 120

// A picture node is a bigger, fixed-ratio card - dagre needs its real size too,
// or it packs picture nodes as if they were the same small width as everything else.
const IMG_W = 240
const IMG_H = 225

// Spacing is sized to the BADGE (edge label), not padded way out: a badge is
// ~100w x ~24h, so a column gap a bit over the badge width and a row gap a bit
// over a node's height is all that's needed to keep labels off the nodes. Keeping
// these tight is what makes a big fan-out graph pack small instead of exploding
// into a sea of whitespace + long crossing edges on fitView.
const RANK_SEP = 150 // gap BETWEEN columns (LR) - clears a ~100px badge with margin
const NODE_SEP = 95  // gap between stacked nodes in a column - clears a badge row
const EDGE_SEP = 30  // separation between adjacent parallel edges

// A laid-out column costs this much horizontally, a wrapped band this much
// vertically.
const COL_STEP = NODE_W + RANK_SEP
const BAND_GAP = 130

// The auto Start here / Destination pills hang ~200px off the first and last
// node and fitView zooms to include them, so they eat into the width budget.
const MARKER_PAD = 400

// Arrange only spends this much of the canvas width, so the diagram keeps a
// margin instead of stretching edge to edge - stretching is what shrinks icons.
const WIDTH_BUDGET = 0.75

// Used when the caller does not know the canvas size.
const DEFAULT_CANVAS = { width: 1440, height: 800 }

// Keeping the styled layout is worth giving up this much screen size, but no
// more: past that the icons have shrunk enough that the style stops paying off.
const STYLE_TOLERANCE = 0.9

// ─── Vertical roles ───────────────────────────────────────────────────────────
// The house style: the flow reads left-to-right down the middle, the data layer
// hangs BELOW it and the edge/config layer sits ABOVE it. A service that only
// attaches to one node (a database, a CDN, a flag service) does not deserve a
// column of its own - it tucks above or below the node it serves, which keeps
// the diagram short instead of stretching it further right.
const BELOW = /db|database|sql|postgres|mysql|aurora|rds|dynamo|mongo|cassandra|keyspace|redis|cache|memcach|elasticache|s3|storage|bucket|object|warehouse|data lake/i
const ABOVE = /cdn|cloudfront|flag|launchdarkly|monitor|cloudwatch|observab|logging|logs|trail|metric|config|dns|route ?53|waf|analytics/i

function verticalRole(node) {
  const svc = findService(node.data ?? node) || {}
  const text = [node.id, node.label, node.sub, svc.label, svc.sub].filter(Boolean).join(' ')
  if (BELOW.test(text)) return 'below'
  if (ABOVE.test(text)) return 'above'
  return null
}

// Leaves (one edge) that carry a vertical role, mapped to the node they serve.
function tuckables(nodes, edges) {
  const degree = {}
  const neighbour = {}
  edges.forEach(e => {
    if (!e.source || !e.target) return
    degree[e.source] = (degree[e.source] || 0) + 1
    degree[e.target] = (degree[e.target] || 0) + 1
    neighbour[e.source] = e.target
    neighbour[e.target] = e.source
  })
  const out = new Map()
  nodes.forEach(n => {
    const role = degree[n.id] === 1 ? verticalRole(n) : null
    if (role && neighbour[n.id]) out.set(n.id, { role, parent: neighbour[n.id] })
  })
  // Never tuck so much that there is no flow left to lay out.
  if (nodes.length - out.size < 2) out.clear()
  return out
}

// ─── Public ───────────────────────────────────────────────────────────────────
// Auto-layout: dagre computes clean, non-overlapping positions. Node data/type
// and edge styling are preserved - only each node's position changes.
//
// Two candidates are built - the plain flow, and the styled one where role
// leaves tuck above/below what they serve - and the one that ends up bigger on
// screen wins. Tucking is the look we want, but on a fan-out heavy graph it can
// stack a column so tall that everything shrinks, which defeats the point.
export function layoutElements(nodes, edges, { rankdir = 'LR', canvas } = {}) {
  const cv = canvas ?? DEFAULT_CANVAS
  ROW_H = nodes.some(n => n.data?.image) ? IMG_H : NODE_H
  const plain = buildLayout(nodes, edges, rankdir, cv, new Map())
  const tucked = tuckables(nodes, edges)
  if (!tucked.size) return plain.nodes
  const styled = buildLayout(nodes, edges, rankdir, cv, tucked)
  return styled.scale >= plain.scale * STYLE_TOLERANCE ? styled.nodes : plain.nodes
}

// ─── Build ────────────────────────────────────────────────────────────────────
// The node the canvas marks "Start here": source of step 1, else any node with
// nothing arriving, else the first node. Kept identical to buildMarkers in
// App.jsx - if the layout disagreed with the pill, the pill would point at a
// node sitting in the middle of the diagram.
function startNodeId(nodes, edges) {
  if (!nodes.length) return null
  const has = id => nodes.some(n => n.id === id)
  if (edges[0]?.source && has(edges[0].source)) return edges[0].source
  const incoming = new Set(edges.map(e => e.target))
  return (nodes.find(n => !incoming.has(n.id)) || nodes[0]).id
}

function buildLayout(nodes, edges, rankdir, canvas, tucked) {
  const g = new dagre.graphlib.Graph()
  g.setGraph({
    rankdir,
    ranksep: RANK_SEP, nodesep: NODE_SEP, edgesep: EDGE_SEP, marginx: 40, marginy: 40,
    ranker: 'network-simplex', // best rank assignment -> fewest long edges
    acyclicer: 'greedy',       // break feedback loops cleanly so back-edges
                               // don't route around and tangle the whole graph
  })
  g.setDefaultEdgeLabel(() => ({}))

  // Tucked leaves are held back from dagre entirely - they get parked on their
  // parent's column afterwards instead of earning a rank of their own.
  const flow = nodes.filter(n => !tucked.has(n.id))
  flow.forEach(n => g.setNode(n.id, n.data?.image ? { width: IMG_W, height: IMG_H } : { width: NODE_W, height: NODE_H }))
  // Edges INTO the start node are withheld from ranking. On a loop - and most
  // real designs close one - the return edge gives the entry node an incoming
  // rank, so dagre pushes it into the middle and the "Start here" pill ends up
  // somewhere other than the left. Withholding it only affects rank assignment;
  // the edge still draws.
  const start = startNodeId(flow, edges)
  edges.forEach(e => {
    if (!e.source || !e.target || tucked.has(e.source) || tucked.has(e.target)) return
    if (e.target === start) return
    g.setEdge(e.source, e.target)
  })

  dagre.layout(g)

  // Step order = edge order (edge i is step i+1). A node's "arrival" is the first
  // step that reaches it; entry nodes borrow their first outgoing step so they lead.
  // Within each column (same rank/x) we re-slot nodes top-to-bottom by arrival, so
  // a fan-out reads 3,4,5,6... downward instead of dagre's crossing-minimized order.
  const arrival = {}
  edges.forEach((e, i) => { if (e.target != null && arrival[e.target] === undefined) arrival[e.target] = i })
  edges.forEach((e, i) => { if (e.source != null && arrival[e.source] === undefined) arrival[e.source] = i - 0.5 })
  const orderKey = id => (arrival[id] ?? Number.MAX_SAFE_INTEGER)

  const placed = flow.map(n => ({ n, p: g.node(n.id) })).filter(x => x.p)
  const cols = new Map()
  for (const item of placed) {
    const k = Math.round(item.p.x)
    if (!cols.has(k)) cols.set(k, [])
    cols.get(k).push(item)
  }
  const newY = new Map()
  for (const arr of cols.values()) {
    const slots = arr.map(a => a.p.y).sort((a, b) => a - b) // top -> bottom
    arr.slice().sort((a, b) => orderKey(a.n.id) - orderKey(b.n.id) || a.p.y - b.p.y)
      .forEach((a, i) => newY.set(a.n.id, slots[i]))
  }

  const centers = new Map(placed.map(({ n, p }) => [n.id, { x: p.x, y: newY.get(n.id) ?? p.y }]))

  // Park each tucked leaf on its parent's column, walking outward from the parent
  // until the slot is clear. Stepping blindly off the parent is what put a
  // DynamoDB exactly on top of a Microservices node: the parent's column already
  // had its own nodes further down, and nothing was checking them.
  const byId = new Map(nodes.map(n => [n.id, n]))
  const taken = new Map([...cols.entries()].map(([k, items]) => [k, items.map(it => centers.get(it.n.id).y)]))
  const seated = []
  for (const [id, { role, parent }] of tucked) {
    const anchor = centers.get(parent)
    if (!anchor) continue
    const key = Math.round(g.node(parent).x)
    const ys = taken.get(key) ?? []
    const dir = role === 'above' ? -1 : 1
    let y = anchor.y + dir * slot()
    for (let k = 2; k <= nodes.length + 2 && !isFree(y, ys); k++) y = anchor.y + dir * slot() * k
    centers.set(id, { x: anchor.x, y })
    ys.push(y)
    taken.set(key, ys)
    const item = { n: byId.get(id) }
    seated.push(item)
    cols.get(key)?.push(item)
  }

  straighten(cols, centers, edges)
  wrapIntoBands(cols, centers, canvas)
  separate(cols, centers)

  // Convert center -> top-left using each node's OWN measured size. Using the
  // nominal card size here left-aligned every node in a column, so boxes of
  // different widths ended up with different centers and the connector between
  // them ran on a slant. Centering on the real width is what makes a stacked
  // chain line up and its edges draw dead straight.
  const out = [...placed.map(({ n }) => n), ...seated.map(s => s.n)].map(n => {
    const c = centers.get(n.id)
    const w = n.measured?.width ?? (n.data?.image ? IMG_W : NODE_W)
    const h = n.measured?.height ?? (n.data?.image ? IMG_H : NODE_H)
    return { ...n, position: { x: c.x - w / 2, y: c.y - h / 2 } }
  })
  return { nodes: out, scale: scaleOf(out, canvas) }
}

// Row spacing follows the tallest card in the diagram. A picture node is almost
// twice the height of a service card, and spacing sized to the small card put
// its note on top of whatever sat under it.
let ROW_H = NODE_H
const slot = () => ROW_H + NODE_SEP     // one vertical step in a column
const minGap = () => ROW_H + 40        // closest 2 node centers may ever sit

const isFree = (y, ys) => ys.every(o => Math.abs(o - y) >= minGap())

// ─── Straighten ───────────────────────────────────────────────────────────────
// Dagre lines a chain up, then re-slotting each column into step order pulls it
// apart again - which is why almost every edge came out as an elbow. This pulls
// it back: walking column by column, a node slides onto the row of whatever
// feeds it, whenever that row is free. An aligned pair draws as one straight
// run instead of a curve, which is the whole look we are after.
//
// It only ever moves a node into an EMPTY slot, so it cannot create an overlap,
// and separate() still runs after it as the guarantee.
function straighten(cols, centers, edges) {
  const colKeys = [...cols.keys()].sort((a, b) => a - b)
  const colOf = new Map()
  colKeys.forEach((k, i) => cols.get(k).forEach(it => colOf.set(it.n.id, i)))

  const partners = (id, pick, other) => edges
    .filter(e => e[pick] === id && centers.has(e[other]))
    .map(e => e[other])

  const tryAlign = (items, it, sources) => {
    if (!sources.length) return
    const ys = sources.map(s => centers.get(s).y).sort((a, b) => a - b)
    const want = ys[Math.floor(ys.length / 2)] // median row of whatever feeds it
    const cur = centers.get(it.n.id)
    if (Math.abs(want - cur.y) < 0.5) return
    const clash = items.some(o => o.n.id !== it.n.id && Math.abs(centers.get(o.n.id).y - want) < minGap())
    if (!clash) centers.set(it.n.id, { ...cur, y: want })
  }

  for (let pass = 0; pass < 2; pass++) {
    // Forward: pull a node onto the row of its upstream neighbours.
    for (let i = 1; i < colKeys.length; i++) {
      const items = cols.get(colKeys[i])
      for (const it of items) {
        tryAlign(items, it, partners(it.n.id, 'target', 'source').filter(s => colOf.get(s) < i))
      }
    }
    // Backward: a node whose downstream neighbours all sit on one row follows
    // them, which straightens the tail of a chain the forward pass cannot reach.
    for (let i = colKeys.length - 2; i >= 0; i--) {
      const items = cols.get(colKeys[i])
      for (const it of items) {
        tryAlign(items, it, partners(it.n.id, 'source', 'target').filter(t => colOf.get(t) > i))
      }
    }
  }
}

// Last line of defence: nothing may ever overlap. Everything above tries to
// place nodes cleanly, but a single overlap ruins a diagram, so each column is
// swept top to bottom and anything too close to its neighbour is pushed down.
function separate(cols, centers) {
  const byX = new Map()
  for (const items of cols.values()) {
    for (const it of items) {
      const c = centers.get(it.n.id)
      const k = Math.round(c.x)
      if (!byX.has(k)) byX.set(k, [])
      byX.get(k).push(it.n.id)
    }
  }
  for (const ids of byX.values()) {
    ids.sort((a, b) => centers.get(a).y - centers.get(b).y)
    for (let i = 1; i < ids.length; i++) {
      const prev = centers.get(ids[i - 1])
      const cur = centers.get(ids[i])
      if (cur.y - prev.y < minGap()) centers.set(ids[i], { ...cur, y: prev.y + minGap() })
    }
  }
}

// How big this layout ends up on screen - the thing we are actually optimising,
// since a bigger scale is the same as bigger icons.
function scaleOf(nodes, canvas) {
  const xs = nodes.map(n => n.position.x)
  const ys = nodes.map(n => n.position.y)
  const w = Math.max(...xs) - Math.min(...xs) + NODE_W + MARKER_PAD
  const h = Math.max(...ys) - Math.min(...ys) + ROW_H
  return Math.min((canvas.width * WIDTH_BUDGET) / w, canvas.height / h)
}

// ─── Wrap ─────────────────────────────────────────────────────────────────────
// A long left-to-right chain is what makes Arrange look bad: the graph gets very
// wide, fitView zooms out to fit it and every icon ends up tiny. So the columns
// only run out to a width budget - past that the layout goes DOWN instead of
// further right, in bands.
//
// This applies to straight pipelines ONLY (see the guard below). Which shape
// wins is decided by the size it would end up on screen, not by a fixed rule -
// that is what stops a wrap being applied to a chain that is already tall.
//
// Bands alternate direction, so the last column of one band sits directly above
// the first column of the next and the wrapping edge is a short hop rather than
// a long line back across the whole diagram.
function wrapIntoBands(cols, centers, canvas) {
  const ranks = [...cols.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, items]) => {
      const ys = items.map(it => centers.get(it.n.id).y)
      return { items, mid: (Math.min(...ys) + Math.max(...ys)) / 2, height: Math.max(...ys) - Math.min(...ys) + ROW_H }
    })
  if (ranks.length < 2) return
  // Only a straight pipeline gets wrapped. Wrapping a graph that branches drags
  // every fan-out edge across the bands and reads far worse than the wide
  // version it was trying to improve on - a smaller bounding box is not worth a
  // diagram you cannot follow.
  if (ranks.some(r => r.items.length > 1)) return

  let best = null
  for (let per = 1; per <= ranks.length; per++) {
    const bands = splitEvenly(ranks, per)
    const w = Math.max(...bands.map(b => b.length)) * COL_STEP - RANK_SEP + MARKER_PAD
    const h = bands.reduce((sum, b) => sum + Math.max(...b.map(r => r.height)), 0) + (bands.length - 1) * BAND_GAP
    const scale = Math.min((canvas.width * WIDTH_BUDGET) / w, canvas.height / h)
    // >= so a tie goes to the wider, flatter option - fewer bands reads better.
    if (!best || scale >= best.scale) best = { scale, bands }
  }

  let top = 0
  best.bands.forEach((band, b) => {
    const bandHeight = Math.max(...band.map(r => r.height))
    const mid = top + bandHeight / 2
    band.forEach((rank, i) => {
      // Even bands read left-to-right, odd ones right-to-left.
      const slot = b % 2 === 0 ? i : band.length - 1 - i
      const x = slot * COL_STEP
      rank.items.forEach(it => {
        const c = centers.get(it.n.id)
        centers.set(it.n.id, { x, y: mid + (c.y - rank.mid) })
      })
    })
    top += bandHeight + BAND_GAP
  })
}

// Consecutive chunks of at most `per` ranks, sized evenly across the bands they
// need: 5 ranks at 3 per band is 3 + 2, never 3 + 1 + 1.
function splitEvenly(ranks, per) {
  const bandCount = Math.ceil(ranks.length / per)
  const size = Math.ceil(ranks.length / bandCount)
  const out = []
  for (let i = 0; i < ranks.length; i += size) out.push(ranks.slice(i, i + size))
  return out
}
