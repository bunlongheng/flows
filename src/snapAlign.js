// ─── Cmd/Ctrl + drag snap-align ───────────────────────────────────────────────
// Hold Cmd (Ctrl on Windows) while dragging a node and it latches onto the
// closest edge/center line of another node, so rows and columns line up and the
// edges between them draw as straight lines instead of near-misses. The canvas
// paints a yellow guide on exactly the line returned here, so you can see where
// it is about to land before you let go.

export const SNAP_THRESHOLD = 10 // flow px - how close before it latches

const rectOf = n => ({
  x: n.position.x,
  y: n.position.y,
  w: n.measured?.width ?? n.width ?? 150,
  h: n.measured?.height ?? n.height ?? 100,
})

// The 3 lines a node can align on per axis: leading edge, center, trailing edge.
const linesX = r => [r.x, r.x + r.w / 2, r.x + r.w]
const linesY = r => [r.y, r.y + r.h / 2, r.y + r.h]

// dragged: the node at its un-snapped drag position. others: every other node.
// Returns the corrected position plus the guides to draw (0, 1 or 2 of them).
export function snapAlign(dragged, others, threshold = SNAP_THRESHOLD) {
  const d = rectOf(dragged)
  const best = { x: null, y: null }

  for (const other of others) {
    if (other.id === dragged.id || !other.position) continue
    const r = rectOf(other)
    const axes = [
      ['x', linesX(d), linesX(r)],
      ['y', linesY(d), linesY(r)],
    ]
    for (const [axis, mine, theirs] of axes) {
      for (const a of mine) {
        for (const b of theirs) {
          const delta = b - a
          if (Math.abs(delta) > threshold) continue
          if (!best[axis] || Math.abs(delta) < Math.abs(best[axis].delta)) {
            best[axis] = { delta, at: b, other: r }
          }
        }
      }
    }
  }

  const position = {
    x: d.x + (best.x?.delta ?? 0),
    y: d.y + (best.y?.delta ?? 0),
  }

  // Guides span from the far edge of one node to the far edge of the other, so
  // the line visibly connects the two things being aligned.
  const snapped = { ...d, ...position }
  const guides = []
  if (best.x) {
    const o = best.x.other
    guides.push({
      axis: 'x', at: best.x.at,
      from: Math.min(snapped.y, o.y),
      to: Math.max(snapped.y + snapped.h, o.y + o.h),
    })
  }
  if (best.y) {
    const o = best.y.other
    guides.push({
      axis: 'y', at: best.y.at,
      from: Math.min(snapped.x, o.x),
      to: Math.max(snapped.x + snapped.w, o.x + o.w),
    })
  }
  return { position, guides }
}

// ─── Consistent padding ───────────────────────────────────────────────────────
// Alignment makes a row straight; padding makes it evenly spaced. The map
// already answers "how far apart do cards sit here" - the most common gap
// between neighbours IS the house measure - so a drag latches onto that measure
// as well as onto the lines, and a card dropped into any section or lane picks
// up the spacing the rest of the map already uses.

export const GAP_THRESHOLD = 14 // flow px - looser than alignment, the eye is
                                // worse at judging a gap than a shared edge

// Same row (for gaps that run along x) or same column (along y).
const shares = (a, b, axis) => (axis === 'x'
  ? a.y < b.y + b.h && b.y < a.y + a.h
  : a.x < b.x + b.w && b.x < a.x + a.w)

// The house gap on 1 axis: tally every neighbouring pair that shares a row or a
// column, most common wins. A tie goes to the smaller gap - a tight grid is the
// intent far more often than a sparse one. 1 lone pair is a coincidence, not a
// measure, so it takes 2 before this answers at all.
export function houseGap(rects, axis) {
  const [p, size] = axis === 'x' ? ['x', 'w'] : ['y', 'h']
  const tally = new Map()
  for (const a of rects) {
    for (const b of rects) {
      if (a === b || !shares(a, b, axis)) continue
      const gap = Math.round(b[p] - (a[p] + a[size]))
      if (gap < 1 || gap > 400) continue
      tally.set(gap, (tally.get(gap) ?? 0) + 1)
    }
  }
  let best = null
  for (const [gap, n] of tally) if (!best || n > best.n || (n === best.n && gap < best.gap)) best = { gap, n }
  return best && best.n >= 2 ? best.gap : null
}

// Where the dragged rect would sit to be exactly 1 house gap from a neighbour,
// on either side of it. Closest wins.
function nearestGapSlot(d, others, axis, gap, threshold) {
  const [p, size] = axis === 'x' ? ['x', 'w'] : ['y', 'h']
  let best = null
  for (const r of others) {
    if (!shares(d, r, axis)) continue
    for (const at of [r[p] + r[size] + gap, r[p] - gap - d[size]]) {
      const delta = at - d[p]
      if (Math.abs(delta) > threshold) continue
      if (!best || Math.abs(delta) < Math.abs(best.delta)) best = { delta, other: r }
    }
  }
  return best
}

// What to suggest while a card is moving.
//
// Position: both kinds answer per axis and the CLOSER one wins. A blanket
// "alignment first" rule sounds right but buries padding, because on a tidy
// grid the aligned column and the house gap want the same spot.
//
// Guides: the rule is drawn when alignment set the axis, and the ribbon is
// drawn whenever the card ENDS UP a house gap from a neighbour - however it
// got there. The 2 are not rivals. On a tidy grid they agree, and then the
// amber rule says "this lines up" while the teal ribbon says "and the space is
// the same 40 as everywhere else", which is the whole question being asked.
//
// Every other card on the map is a candidate, in this section, this lane or any
// other, because a map reads as one grid or it reads as none.
const SETTLED = 1.5 // flow px - close enough to call a gap exact

export function snapSuggest(dragged, others, threshold = SNAP_THRESHOLD, gapThreshold = GAP_THRESHOLD) {
  const aligned = snapAlign(dragged, others, threshold)
  const d = rectOf(dragged)
  const rects = others.filter(o => o.id !== dragged.id && o.position).map(rectOf)
  const position = { ...aligned.position }
  const rules = {}

  for (const axis of ['x', 'y']) {
    const p = axis === 'x' ? 'x' : 'y'
    const rule = aligned.guides.find(g => g.axis === axis)
    const ruleDelta = rule ? aligned.position[axis] - d[p] : null
    const gap = houseGap(rects, axis)
    const slot = gap == null ? null : nearestGapSlot(d, rects, axis, gap, gapThreshold)
    if (slot && (ruleDelta == null || Math.abs(slot.delta) < Math.abs(ruleDelta))) position[axis] = d[p] + slot.delta
    else if (rule) rules[axis] = rule
  }

  const guides = []
  for (const axis of ['x', 'y']) {
    if (rules[axis]) guides.push(rules[axis])
    const [p, size] = axis === 'x' ? ['x', 'w'] : ['y', 'h']
    const gap = houseGap(rects, axis)
    if (gap == null) continue
    const me = { ...d, ...position }
    const settled = nearestGapSlot(me, rects, axis, gap, SETTLED)
    if (!settled) continue
    // The ribbon is drawn IN the gap it measures: from the neighbour's facing
    // edge to the card's, centred across the pair.
    const o = settled.other
    const lo = me[p] < o[p] ? me : o
    const hi = me[p] < o[p] ? o : me
    guides.push({
      kind: 'gap', axis, gap,
      from: lo[p] + lo[size], to: hi[p],
      at: axis === 'x'
        ? (Math.max(me.y, o.y) + Math.min(me.y + me.h, o.y + o.h)) / 2
        : (Math.max(me.x, o.x) + Math.min(me.x + me.w, o.x + o.w)) / 2,
    })
  }
  return { position, guides }
}
