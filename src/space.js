// The grid a diagram was drawn on, opened up until what sits BETWEEN the cards
// fits: a line's tag in the gap between 2 columns, a card's note in the gap
// between 2 rows. Cards that share an x are a column, cards that share a y are a
// row, and a gap is only ever widened - the author's layout is kept, it just
// stops being cramped. Pure, and running it twice changes nothing.

export function spaceTracks(rects, axis, want) {
  const [at, size] = axis === 'col' ? ['x', 'w'] : ['y', 'h']
  const tracks = [...new Set(rects.map(r => r[at]))].sort((a, b) => a - b)
  const shift = new Map()
  let moved = 0
  for (let i = 1; i < tracks.length; i++) {
    const prev = tracks[i - 1], cur = tracks[i]
    const need = want(prev, cur)
    // Nothing has to sit in this gap: leave it exactly as the author drew it,
    // overlap included - 2 cards may be stacked on purpose.
    const end = need > 0 ? Math.max(...rects.filter(r => r[at] === prev).map(r => r[at] + r[size])) : cur
    moved += Math.max(0, Math.round(need - (cur - end)))
    if (moved) for (const r of rects) if (r[at] === cur) shift.set(r.id, moved)
  }
  return shift
}
