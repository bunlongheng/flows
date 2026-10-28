import { describe, it, expect } from 'vitest'
import { cleanFlowIcon } from '../../lib/validate-design.js'
import { flowMark } from '../../src/brands.js'
import { SERVICES } from '../../src/services.js'

describe('cleanFlowIcon', () => {
  it('resolves a catalog id to its logo and keeps a custom icon', () => {
    expect(cleanFlowIcon('lambda')).toBe(SERVICES.lambda.icon)
    expect(cleanFlowIcon('/brand/vcita.png')).toBe('/brand/vcita.png')
    expect(cleanFlowIcon('https://x.com/a.svg')).toBe('https://x.com/a.svg')
  })
  it('null for none, undefined for junk', () => {
    expect(cleanFlowIcon('')).toBe(null)
    expect(cleanFlowIcon(undefined)).toBe(null)
    expect(cleanFlowIcon('javascript:alert(1)')).toBe(undefined)
    expect(cleanFlowIcon('nope')).toBe(undefined)
  })
})

describe('flowMark', () => {
  it('the set icon wins, then the brand, then the first card logo', () => {
    expect(flowMark({ icon: '/brand/a.svg', title: 'Stripe' }).icon).toBe('/brand/a.svg')
    expect(flowMark({ title: 'Stripe' }).icon).toBe('/brand/stripe.svg')
    expect(flowMark({ title: 'x', nodes: [{ id: 'lambda' }] }).icon).toBe(SERVICES.lambda.icon)
    expect(flowMark({ title: 'x', nodes: [] })).toBe(null)
  })
})
