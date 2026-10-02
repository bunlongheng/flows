// The code panel shows a diagram's JSON. An inline icon is a base64 data URI
// of a few thousand characters, so 1 icon buries the 4 lines around it that
// matter. The panel shows the head of every data URI and how long it is; Copy
// still takes the whole JSON, so this is for reading, never for saving.
const DATA_URI = /"(data:[^;"]+;base64,)([A-Za-z0-9+/=]{24})[A-Za-z0-9+/=]*"/g

export function previewCode(data) {
  return JSON.stringify(data, null, 2).replace(DATA_URI, (m, prefix, head) => `"${prefix}${head}... ${m.length - 2} chars"`)
}

// Greyscale syntax colouring for the panel: keys darkest, strings mid, numbers
// and literals lighter, punctuation lightest. Each token is { kind, text } and
// the texts join back into the exact input, so the panel never drops a char.
const TOKEN = /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)|\b(true|false|null)\b|([{}[\],:])/g

export function tokenizeCode(text) {
  const out = []
  let last = 0
  for (const m of text.matchAll(TOKEN)) {
    if (m.index > last) out.push({ kind: 'plain', text: text.slice(last, m.index) })
    if (m[1] != null) {
      out.push({ kind: m[2] != null ? 'key' : 'string', text: m[1] })
      if (m[2] != null) out.push({ kind: 'punct', text: m[2] })
    } else if (m[3] != null) out.push({ kind: 'number', text: m[3] })
    else if (m[4] != null) out.push({ kind: 'literal', text: m[4] })
    else out.push({ kind: 'punct', text: m[5] })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ kind: 'plain', text: text.slice(last) })
  return out
}
