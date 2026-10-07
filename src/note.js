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

// An edge label is the badge ON the line: what travels, in a few words. It is
// drawn on 1 line and never wraps, so it is bounded far shorter than a note and
// every newline folds to a space. '' removes the badge.
export const EDGE_LABEL_MAX = 60
export const cleanEdgeLabel = v => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, EDGE_LABEL_MAX) : '')

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

// What a link SHOWS. The owner links tickets, and a note that prints the whole
// Jira URL is a note nobody can read, so a link wears its ticket key when the
// URL carries one (SHAR-7977) and otherwise its address minus the scheme and
// www, cut short. The full URL stays on the anchor's title and href.
export function linkLabel(url) {
  const pr = String(url || '').match(/github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/)
  if (pr) return `PR ${pr[1]}`
  const key = String(url || '').match(/[A-Z][A-Z0-9]+-\d+/)
  if (key) return key[0]
  const bare = String(url || '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '')
  return bare.length > 32 ? `${bare.slice(0, 31)}…` : bare
}

// The info popover always opens with the card's name: "Cyclr is the embedded
// iPaaS behind...". Text that already names the card is left alone; the rest
// gets "<name> is " in front, with the old first letter dropped to lower case
// unless it is an initialism (AWS, S3) that has to keep it.
export function infoLead(label, info) {
  const text = String(info || '').trim()
  const name = String(label || '').trim()
  if (!text || !name) return { name: '', rest: text }
  if (text.toLowerCase().startsWith(name.toLowerCase())) return { name: text.slice(0, name.length), rest: text.slice(name.length) }
  const first = text[0], second = text[1] || ''
  const lead = second && second === second.toLowerCase() && second !== second.toUpperCase() ? first.toLowerCase() : first
  return { name, rest: ` is ${lead}${text.slice(1)}` }
}

// Light markdown inside a note: **bold**, *italic* or _italic_, __underline__,
// ~~strike~~ and `code`. One level, no nesting - a note is 1-2 sentences, and
// the marks are there so a word can carry weight, not to typeset a page. A
// link stays a link (noteParts runs first, so a URL's underscores are safe),
// and _ only counts at a word edge, so snake_case reads as written.
const MARK_RE = /`([^`\n]+)`|\*\*(.+?)\*\*|__(.+?)__|~~(.+?)~~|(?<![A-Za-z0-9*])\*([^*\n]+?)\*(?![A-Za-z0-9*])|(?<![A-Za-z0-9_])_([^_\n]+?)_(?![A-Za-z0-9_])/g
export function noteRuns(text) {
  const out = []
  for (const part of noteParts(text)) {
    if (part.url) { out.push(part); continue }
    let last = 0
    for (const m of part.text.matchAll(MARK_RE)) {
      if (m.index > last) out.push({ text: part.text.slice(last, m.index) })
      if (m[1] != null) out.push({ text: m[1], code: true })
      else if (m[2] != null) out.push({ text: m[2], b: true })
      else if (m[3] != null) out.push({ text: m[3], u: true })
      else if (m[4] != null) out.push({ text: m[4], s: true })
      else out.push({ text: m[5] ?? m[6], i: true })
      last = m.index + m[0].length
    }
    if (last < part.text.length) out.push({ text: part.text.slice(last) })
  }
  return out
}
