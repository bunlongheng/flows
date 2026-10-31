import { describe, it, expect } from 'vitest'
import { cleanHashtags } from '../../src/hashtags.js'

describe('cleanHashtags', () => {
  it('takes a list or 1 string and strips the #', () => {
    expect(cleanHashtags(['#c4'])).toEqual(['c4'])
    expect(cleanHashtags('#c4 #thryv, vendors')).toEqual(['c4', 'thryv', 'vendors'])
  })
  it('drops junk and case-insensitive repeats, caps at 5', () => {
    expect(cleanHashtags(['c4', 'C4', 'a b', '<x>', '', null])).toEqual(['c4'])
    expect(cleanHashtags('a b c d e f g')).toHaveLength(5)
    expect(cleanHashtags(undefined)).toEqual([])
    expect(cleanHashtags(['x'.repeat(33)])).toEqual([])
  })
})
