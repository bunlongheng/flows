// A flow's hashtags: usually 1, up to 5. Stored without the "#", trimmed,
// letters, digits, _ and - only, 32 chars max, deduped ignoring case. Takes a
// list or 1 string ("#c4 #thryv" or "c4, thryv"); junk entries are dropped.
export const MAX_HASHTAGS = 5
export function cleanHashtags(v) {
  const raw = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[\s,]+/) : []
  const out = []
  for (const t of raw) {
    const s = String(t ?? '').trim().replace(/^#+/, '')
    if (!/^[\w-]{1,32}$/.test(s) || out.some(o => o.toLowerCase() === s.toLowerCase())) continue
    out.push(s)
    if (out.length === MAX_HASHTAGS) break
  }
  return out
}
