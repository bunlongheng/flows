import { describe, it, expect } from 'vitest'
import { urlLevel, levelOf } from '../../src/view-state.js'

describe('urlLevel', () => {
  it('reads ?level=c2, C3 and 4', () => {
    expect(urlLevel('?id=x&level=c2')).toBe(2)
    expect(urlLevel('?level=C3')).toBe(3)
    expect(urlLevel('?level=4')).toBe(4)
  })
  it('ignores a missing or bad level', () => {
    expect(urlLevel('?id=x')).toBe(null)
    expect(urlLevel('?level=c9')).toBe(null)
    expect(urlLevel('?level=abc')).toBe(null)
  })
  it('a level the diagram lacks falls back to its top level', () => {
    const nodes = [{ level: 1 }, { level: 2 }]
    expect(levelOf({ level: urlLevel('?level=c2') }, nodes)).toBe(2)
    expect(levelOf({ level: urlLevel('?level=c4') }, nodes)).toBe(1)
  })
})
