import { describe, it, expect } from 'vitest'
import { tidy } from '../../src/tidy.js'
import { laneRects, LANE_GAP, SECTION_PAD } from '../../src/lanes.js'

const card = (id, x, y) => ({ id, x, y, w: 180, h: 230 })

describe('tidy', () => {
  it('straightens a ragged row onto 1 line and 1 gap', () => {
    const { positions } = tidy([card('a', 0, 0), card('b', 260, 30), card('c', 560, -20)])
    expect(new Set(Object.values(positions).map(p => p.y)).size).toBe(1)
    expect(positions.c.x - positions.b.x).toBe(positions.b.x - positions.a.x)
  })

  it('hugs every panel with 1 pad and stacks panels 1 gap apart', () => {
    const lanes = [
      { id: 'top', title: 'Top', x: 0, y: 0, w: 600, h: 500 },
      { id: 'low', title: 'Low', x: 0, y: 700, w: 900, h: 600 },
      { id: 'side', title: 'Side', x: 1000, y: 650, w: 400, h: 600 },
    ]
    const cards = [card('a', 50, 60), card('b', 50, 760), card('c', 1050, 720)]
    const t = tidy(cards, lanes)
    const moved = cards.map(c => ({ ...c, ...t.positions[c.id] }))
    const [top, low, side] = laneRects(t.lanes, moved)
    expect(top.x).toBe(moved[0].x - SECTION_PAD)
    expect(low.y - (top.y + top.h)).toBe(LANE_GAP)
    expect(side.y).toBe(low.y)
    expect(side.x - (low.x + low.w)).toBe(LANE_GAP)
  })
})
