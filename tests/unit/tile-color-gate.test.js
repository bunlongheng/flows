import { describe, it, expect } from 'vitest'
import { clashes } from '../../lib/logo-color.js'

// The hard gate: a border never fights the tile it frames.
describe('clashes', () => {
  it('flags a mint border round a red tile', () => {
    expect(clashes('#4adfbc', '#e11d48')).toBe(true)
  })
  it('flags a yellow border round a black tile', () => {
    expect(clashes('#ffc42d', '#0d1320')).toBe(true)
  })
  it('keeps a curated hex of the same hue', () => {
    expect(clashes('#EB5424', '#ed5524')).toBe(false)
    expect(clashes('#ef4444', '#e11d48')).toBe(false)
  })
  it('keeps a dark border round a black tile', () => {
    expect(clashes('#111827', '#0d1320')).toBe(false)
  })
  it('gives no verdict without a tile', () => {
    expect(clashes('#4adfbc', null)).toBe(false)
  })
})
