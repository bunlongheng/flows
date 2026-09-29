// A node note is plain text under the card: what this step does, why it is
// there, or what changes. Trimmed and bounded so a shared row stays small.
// '' means "no note" everywhere - the key is dropped rather than stored empty.
export const NOTE_MAX = 400
export const cleanNote = v => (typeof v === 'string' ? v.trim().slice(0, NOTE_MAX) : '')

// A node info is plain text hidden until the reader hovers or clicks the i
// badge: what this thing is and why it exists in this diagram, in 1-3 sentences.
// '' means "no info" everywhere - the key is dropped rather than stored empty.
export const INFO_MAX = 600
export const cleanInfo = v => (typeof v === 'string' ? v.trim().slice(0, INFO_MAX) : '')

// A URL inside a note is drawn as a link (the owner links tickets there), so
// the text is split into plain runs and links. Only http(s) counts - a bare
// ticket key has no base to point at. Trailing punctuation stays text, so a
// link at the end of a sentence does not swallow the full stop.
const URL_RE = /https?:\/\/[^\s<>"']+/g
export function noteParts(text) {
  const out = []
  let last = 0
  for (const m of String(text || '').matchAll(URL_RE)) {
    let url = m[0]
    const trail = url.match(/[.,;:!?)\]]+$/)
    if (trail) url = url.slice(0, -trail[0].length)
    if (m.index > last) out.push({ text: text.slice(last, m.index) })
    out.push({ url })
    last = m.index + url.length
  }
  if (last < String(text || '').length) out.push({ text: text.slice(last) })
  return out
}
