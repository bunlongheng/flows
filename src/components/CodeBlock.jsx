import { previewCode, tokenizeCode } from '../codePreview.js'

// The read-only JSON in a code panel: inline icons shortened, greyscale
// syntax colouring, 20 percent smaller than the panel's body text.
const INK = { key: '#111111', string: '#555555', number: '#3a3a3a', literal: '#777777', punct: '#9a9a9a', plain: '#1c1e21' }

export function CodeBlock({ data, fontSize = 9, padding = '14px 16px' }) {
  return (
    <pre style={{
      margin: 0, padding, fontSize, lineHeight: 1.75, color: INK.plain,
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace", whiteSpace: 'pre-wrap', wordBreak: 'break-word',
    }}>
      {tokenizeCode(previewCode(data)).map((t, i) => <span key={i} style={{ color: INK[t.kind] }}>{t.text}</span>)}
    </pre>
  )
}
