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

const caption = { ...PANEL_CAPTION, marginBottom: 8 }
const body = { fontSize: 12.5, lineHeight: 1.5, color: '#1a2129', whiteSpace: 'pre-wrap' }
const block = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }
const key = { fontSize: 11, color: '#6b7280' }
const empty = { fontSize: 11.5, color: '#94a3b8' }

// Text with inline `code`, **bold**, *italic*, __underline__, ~~strike~~,
// [label](url) and bare links, the marks a card note takes (src/note.js).
const Rich = ({ text }) => (
  <div style={body}>
    {noteRuns(text).map((part, i) => part.url
      ? <a key={i} href={part.url} title={part.url} target="_blank" rel="noopener noreferrer" style={{ color: '#1d4ed8', textDecoration: 'underline' }}>{linkLabel(part.url, part.label)}</a>
      : <span key={i} style={runStyle(part)}>{part.text}</span>)}
  </div>
)

const Section = ({ title, children }) => (
  <section style={block}>
    <div style={caption}>{title}</div>
    {children}
  </section>
)

// Read-only card detail panel, the reading twin of FormatPanel's line editor:
// a clicked card, in 4 blocks - what it is, its note, then
// every line into it and out of it, the 2 lists together at the foot of the
// panel. Same look as the Share panel
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

  const byStep = (a, b) => (a.data?.step || 0) - (b.data?.step || 0)
  const out = edges.filter(e => e.source === node.id).sort(byStep)
  const into = edges.filter(e => e.target === node.id).sort(byStep)


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

      <Section title="What it is">
        {info ? <Rich text={info} /> : <div style={empty}>No description</div>}
      </Section>

      <Section title="Notes">
        {note ? <Rich text={note} /> : <div style={empty}>No notes</div>}
      </Section>

      {/* The 2 connection lists sit together under the note (owner 2026-10-09:
          "connection in and out should next to each other in the details panel,
          below notes"). In first, then out - a reader thinks in, then out. They
          are also the longest blocks, so the short ones are not pushed off the
          top of the panel by a card with 9 lines. */}
      <Section title={`Connections in (${into.length})`}>
        {list(into, e => e.source, '←')}
      </Section>

      <Section title={`Connections out (${out.length})`}>
        {list(out, e => e.target, '→')}
      </Section>

    </aside>
  )
}

// Read-only step panel: a clicked tag's step number and text, what the line
// is (its description), what it does (which card hands off to which), and the
// notes of the 2 cards it joins. Same slot and look as the card panel.
export function StepPanel({ edge, nodes, onPick, onClose }) {
  const d = edge.data || {}
  const sunset = !!d.sunset
  const desc = typeof d.description === 'string' ? d.description.trim() : ''
  const tag = edge.label || desc || 'Step'
  const end = id => {
    const n = laneRef(id) ? null : nodes.find(x => x.id === id)
    const icon = endIcon(id, nodes)
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        {icon && <img src={icon} alt="" width={16} height={16} style={{ flexShrink: 0, objectFit: 'contain', filter: sunset ? 'grayscale(0.5)' : undefined }} />}
        {n
          ? <button type="button" onClick={() => onPick(id)} style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontWeight: 600, color: '#1a2129', cursor: 'pointer', textAlign: 'left' }}>{endName(id, nodes)}</button>
          : <span style={{ fontWeight: 600, color: '#1a2129' }}>{endName(id, nodes)}</span>}
      </span>
    )
  }
  const notes = [edge.source, edge.target]
    .map(id => ({ id, note: laneRef(id) ? '' : cleanNote(nodes.find(x => x.id === id)?.data?.note) }))
    .filter(x => x.note)

  return (
    <aside className="sd-card-panel" data-testid="step-panel" style={PANEL}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 16 }}>
        {d.step != null && <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: sunset ? '#94a3b8' : '#1a2129', borderRadius: 999, padding: '2px 8px', flexShrink: 0 }}>{d.step}</span>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1a2129' }}>{tag}</div>
          <div style={{ fontSize: 11.5, color: '#6b7280' }}>{sunset ? 'Step on its way out (sunset)' : d.step != null ? `Step ${d.step}` : 'Line'}</div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close step panel" style={PANEL_CLOSE}>✕</button>
      </div>

      <Section title="What it is">
        {desc ? <Rich text={desc} /> : <div style={empty}>No description</div>}
      </Section>

      <Section title="What it does">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
          {end(edge.source)}<span aria-hidden="true" style={{ color: '#6b7280' }}>→</span>{end(edge.target)}
        </div>
      </Section>

      <Section title="Notes">
        {notes.length
          ? notes.map(({ id, note }) => (
              <div key={id} style={{ marginTop: 4 }}>
                <div style={{ ...key, marginBottom: 2 }}>{endName(id, nodes)}</div>
                <Rich text={note} />
              </div>))
          : <div style={empty}>No notes</div>}
      </Section>
    </aside>
  )
}
