// Tidy: keep the layout the owner built, but make its spacing the house's.
// Unlike Arrange it never re-routes the graph; it only straightens.
//   1. Cards whose tops (or lefts) sit within SNAP of each other share 1 line.
//   2. Cards side by side in 1 row, inside 1 panel, sit on 1 gap: the one that
//      panel uses most.
//   3. Sibling panels sit LANE_GAP apart, stacked or side by side; a panel
//      moves with everything in it.
//   4. Every free panel is saved as it draws: hugging its cards (and panels
//      nested in it) with SECTION_PAD on all 4 sides (src/lanes.js).
import { laneAxis, laneRects, freeHome, LANE_GAP } from './lanes.js'

export const SNAP = 60

// Positions within SNAP of the first of their run move onto it.
function snapRuns(cards, k) {
  const sorted = [...cards].sort((a, b) => a[k] - b[k])
  for (let i = 0; i < sorted.length;) {
    let j = i
    while (j + 1 < sorted.length && sorted[j + 1][k] - sorted[i][k] < SNAP) j++
    for (const c of sorted.slice(i + 1, j + 1)) c[k] = sorted[i][k]
    i = j + 1
  }
}

const mode = xs => {
  const n = new Map()
  for (const x of xs) n.set(x, (n.get(x) || 0) + 1)
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0]
}

const inside = (o, l) => o !== l && o.x >= l.x && o.y >= l.y && o.x + o.w <= l.x + l.w && o.y + o.h <= l.y + l.h
const overlaps = (a, b, k, s) => a[k] < b[k] + b[s] && b[k] < a[k] + a[s]

/** cards [{id,x,y,w,h}] (h with its note), lanes = view_state.lanes. Returns { positions: {id:{x,y}}, lanes }. */
export function tidy(cards, lanes = []) {
  const cs = cards.map(c => ({ ...c }))
  const free = lanes.length > 0 && laneAxis(lanes) === 'free'
  const home = free ? freeHome(lanes, cs) : {}
  // Lines are straightened inside 1 panel; across panels the padding decides.
  for (const p of new Set(cs.map(c => home[c.id]))) {
    const mine = cs.filter(c => home[c.id] === p)
    snapRuns(mine, 'y')
    snapRuns(mine, 'x')
  }
  const rows = new Map()
  for (const c of cs) {
    const key = `${home[c.id] ?? ''}|${c.y}`
    rows.set(key, [...(rows.get(key) || []), c])
  }
  const byPanel = new Map()
  for (const [key, row] of rows) {
    row.sort((a, b) => a.x - b.x)
    const gaps = row.slice(1).map((c, i) => c.x - (row[i].x + row[i].w))
    const p = key.split('|')[0]
    byPanel.set(p, [...(byPanel.get(p) || []), ...gaps.filter(g => g > 0)])
  }
  for (const [key, row] of rows) {
    const gap = mode(byPanel.get(key.split('|')[0]))
    if (gap == null) continue
    for (let i = 1; i < row.length; i++) row[i].x = row[i - 1].x + row[i - 1].w + gap
  }
  if (!free) return { positions: Object.fromEntries(cs.map(c => [c.id, { x: c.x, y: c.y }])), lanes }

  // Panels as they draw now; saved boxes decide who nests in whom.
  let boxes = laneRects(lanes, cs).map(r => ({ ...r }))
  const saved = Object.fromEntries(lanes.map(l => [l.id, l]))
  const kids = l => lanes.filter(o => inside(o, l)).map(o => o.id)
  const parent = l => lanes.filter(o => inside(l, o)).reduce((a, o) => (!a || o.w * o.h < a.w * a.h ? o : a), null)?.id ?? ''
  const move = (id, k, d) => {
    const ids = new Set([id, ...kids(saved[id])])
    for (const b of boxes) if (ids.has(b.id)) b[k] += d
    for (const c of cs) if (ids.has(home[c.id])) c[k] += d
  }
  const groups = new Map()
  for (const l of lanes) groups.set(parent(l), [...(groups.get(parent(l)) || []), l.id])
  // Innermost first: a nested panel settles, its parent re-hugs, then the
  // parent takes its own place among its siblings.
  const depth = g => (g ? lanes.filter(o => inside(saved[g], o)).length + 1 : 0)
  const order = [...groups.keys()].sort((a, b) => depth(b) - depth(a))
  const now = () => lanes.map(l => ({ ...l, ...pick(boxes.find(b => b.id === l.id)) }))
  for (const g of order) {
    const of = id => boxes.find(b => b.id === id)
    // Stacked: panels whose tops sit within SNAP form 1 band and move as 1, to
    // LANE_GAP under the lowest earlier panel any of them sits beneath.
    const sibs = groups.get(g).map(of).sort((a, b) => a.y - b.y)
    for (let i = 0; i < sibs.length;) {
      let j = i
      while (j + 1 < sibs.length && sibs[j + 1].y - sibs[i].y < SNAP) j++
      const band = sibs.slice(i, j + 1)
      const above = sibs.slice(0, i).filter(a => band.some(b => overlaps(a, b, 'x', 'w')))
      const want = above.length ? Math.max(...above.map(a => a.y + a.h)) + LANE_GAP : band[0].y
      for (const b of band) if (b.y !== want) move(b.id, 'y', want - b.y)
      i = j + 1
    }
    // Side by side: LANE_GAP right of the nearest earlier panel on its level.
    const row = groups.get(g).map(of).sort((a, b) => a.x - b.x)
    row.forEach((b, i) => {
      const left = row.slice(0, i).filter(a => overlaps(a, b, 'y', 'h') && a.x + a.w <= b.x + 1)
      if (left.length) move(b.id, 'x', Math.max(...left.map(a => a.x + a.w)) + LANE_GAP - b.x)
    })
    boxes = laneRects(now(), cs).map(r => ({ ...r }))
  }
  return {
    positions: Object.fromEntries(cs.map(c => [c.id, { x: Math.round(c.x), y: Math.round(c.y) }])),
    lanes: lanes.map(l => ({ ...l, ...pick(boxes.find(b => b.id === l.id)) })),
  }
}

const pick = b => ({ x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) })
