import { findService } from '../services.js'
import { cleanNote, noteRuns, linkLabel } from '../note.js'
import { runStyle } from './AwsNode'
import { laneRef } from '../lanes.js'
import { PANEL, PANEL_CAPTION, PANEL_CLOSE } from '../panel.js'

// A connection's other end has no node of its own when it is a lane (its id
// is "lane:<id>"), so it is named directly rather than looked up.
function endName(id, nodes) {
  const lane = laneRef(id)
  if (lane) return `Lane ${lane}`
  const n = nodes.find(x => x.id === id)
  if (!n) return id
  const svc = findService(n.data || {})
  return svc.label || n.data?.label || n.data?.id || id
}

// The other end's logo, the same pick as the header makes for this card.
function endIcon(id, nodes) {
  if (laneRef(id)) return null
  const d = nodes.find(x => x.id === id)?.data
  if (!d) return null
  return (typeof d.image === 'string' && d.image.startsWith('data:') && d.image)
    || (typeof d.icon === 'string' && d.icon) || findService(d).icon || null
}

// The lane band and section band a card's centre sits in, by name. Lane nodes
// ride in the same nodes array (type "lane") with their sections in the band's
// own coordinates, so no view_state is needed here.
function placeOf(node, nodes) {
  const w = node.measured?.width ?? node.width ?? 180, h = node.measured?.height ?? node.height ?? 180
  const cx = (node.position?.x ?? 0) + w / 2, cy = (node.position?.y ?? 0) + h / 2
  const inside = (r, x, y) => cx >= x + r.x && cx <= x + r.x + r.w && cy >= y + r.y && cy <= y + r.y + r.h
  const lane = nodes.find(n => n.type === 'lane' && inside({ x: 0, y: 0, w: n.width ?? 0, h: n.height ?? 0 }, n.position?.x ?? 0, n.position?.y ?? 0))
  if (!lane) return null
  const section = (lane.data?.sections || []).find(s => inside(s, lane.position?.x ?? 0, lane.position?.y ?? 0))
  return { lane: lane.data?.title || '', section: section?.title || '' }
}

const caption = { ...PANEL_CAPTION, marginBottom: 8 }
const body = { fontSize: 12.5, lineHeight: 1.5, color: '#1a2129', whiteSpace: 'pre-wrap' }
const block = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }
const key = { fontSize: 11, color: '#6b7280' }
const val = { fontSize: 12, color: '#1a2129', fontWeight: 600, textAlign: 'right', minWidth: 0, overflowWrap: 'anywhere' }
const empty = { fontSize: 11.5, color: '#94a3b8' }

const Section = ({ title, children }) => (
  <section style={block}>
    <div style={caption}>{title}</div>
    {children}
  </section>
)

// Read-only card detail panel, the reading twin of FormatPanel's line editor:
// a clicked card, in 5 blocks - the card's facts, what it is, its note, and
// every line into it (top) and out of it (bottom). Same look as the Share panel
// (DetailView.jsx) - width, background, border, slide-in - a different body.
export function CardPanel({ node, nodes, edges, onPick, onClose }) {
  const data = node.data || {}
  const svc = findService(data)
  const label = svc.label || data.label || data.id
  const sub = svc.sub || data.sub
  const note = cleanNote(data.note)
  const info = typeof data.info === 'string' ? data.info.trim() : ''
  const icon = typeof data.image === 'string' && data.image.startsWith('data:') ? data.image
    : (typeof data.icon === 'string' && data.icon) || svc.icon
  const place = placeOf(node, nodes)

  const byStep = (a, b) => (a.data?.step || 0) - (b.data?.step || 0)
  const out = edges.filter(e => e.source === node.id).sort(byStep)
  const into = edges.filter(e => e.target === node.id).sort(byStep)

  const facts = [
    ['Type', sub],
    ['Status', data.sunset === true ? 'Sunset' : 'Active'],
    ['Lane', place?.lane],
    ['Section', place?.section],
    ['Lines', `${out.length} out, ${into.length} in`],
  ].filter(([, v]) => v)

  const row = (e, otherId, arrow) => {
    const sunset = !!e.data?.sunset
    const ink = sunset ? '#94a3b8' : '#1a2129'
    return (
      <div key={e.id} style={{ fontSize: 12, padding: '8px 0', borderTop: '1px solid #f1f5f9' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: sunset ? '#94a3b8' : '#1a2129', borderRadius: 999, padding: '1px 6px', flexShrink: 0 }}>{e.data?.step}</span>
          <span aria-hidden="true" style={{ color: ink }}>{arrow}</span>
          {endIcon(otherId, nodes) && <img src={endIcon(otherId, nodes)} alt="" width={16} height={16} style={{ flexShrink: 0, objectFit: 'contain', alignSelf: 'center', filter: sunset ? 'grayscale(1)' : undefined }} />}
          {laneRef(otherId)
            ? <span style={{ fontWeight: 600, color: ink }}>{endName(otherId, nodes)}</span>
            : <button type="button" onClick={() => onPick(otherId)} style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontWeight: 600, color: ink, cursor: 'pointer', textAlign: 'left' }}>
                {endName(otherId, nodes)}
              </button>}
          {sunset && <span style={{ ...empty, marginLeft: 'auto' }}>sunset</span>}
        </div>
        {e.label && <div style={{ display: 'flex', gap: 8, marginTop: 4 }}><span style={key}>Tag</span><span style={{ fontSize: 11.5, color: sunset ? '#94a3b8' : '#334155' }}>{e.label}</span></div>}
        {e.data?.description && <div style={{ display: 'flex', gap: 8, marginTop: 2 }}><span style={key}>Note</span><span style={{ fontSize: 11, color: '#6b7280' }}>{e.data.description}</span></div>}
      </div>
    )
  }

  const list = (items, otherOf, arrow) => (items.length
    ? items.map(e => row(e, otherOf(e), arrow))
    : <div style={empty}>None</div>)

  return (
    <aside className="sd-card-panel" data-testid="card-panel" style={PANEL}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 16 }}>
        {icon && <img src={icon} alt="" width={28} height={28} style={{ flexShrink: 0, objectFit: 'contain' }} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1a2129' }}>{label}</div>
          {sub && <div style={{ fontSize: 11.5, color: '#6b7280' }}>{sub}</div>}
        </div>
        <button type="button" onClick={onClose} aria-label="Close card panel" style={PANEL_CLOSE}>✕</button>
      </div>

      {/* In at the top, out at the bottom: a reader thinks in, then out
          (owner 2026-10-09), so the card's own facts sit between the 2. */}
      <Section title={`Connections in (${into.length})`}>
        {list(into, e => e.source, '←')}
      </Section>

      <Section title="Card">
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', rowGap: 6, columnGap: 12 }}>
          {facts.map(([k, v]) => [<span key={k + 'k'} style={key}>{k}</span>, <span key={k + 'v'} style={val}>{v}</span>])}
        </div>
      </Section>

      <Section title="What it is">
        {info ? <div style={body}>{info}</div> : <div style={empty}>No description</div>}
      </Section>

      <Section title="Notes">
        {note ? (
          <div style={body}>
            {noteRuns(note).map((part, i) => part.url
              ? <a key={i} href={part.url} title={part.url} target="_blank" rel="noopener noreferrer" style={{ color: '#1d4ed8', textDecoration: 'underline' }}>{linkLabel(part.url)}</a>
              : <span key={i} style={runStyle(part)}>{part.text}</span>)}
          </div>
        ) : <div style={empty}>No notes</div>}
      </Section>

      <Section title={`Connections out (${out.length})`}>
        {list(out, e => e.target, '→')}
      </Section>

    </aside>
  )
}
