import { memo, useContext, useRef, useState } from 'react'
import { Handle, Position } from '@xyflow/react'
import { findService } from '../services'
import { NoteEditContext, ShowNotesContext } from './noteEditContext'
import { NOTE_MAX, cleanNote } from '../note'

// ─── Custom Node ──────────────────────────────────────────────────────────────

// Two lines then an ellipsis. Without this a sentence-long sub simply grew the
// card downwards once its width was capped.
const CLAMP_2 = {
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  overflowWrap: 'anywhere',
}

const CLAMP_3 = { ...CLAMP_2, WebkitLineClamp: 3 }

// The bordered caption hanging off a card's bottom-left corner. Plain black
// text in a black frame, clamped to 3 lines with the full note on hover. The
// owner double-clicks it (or the "+ note" ghost on an empty card) to edit;
// everyone else just reads it, so a shared link shows exactly the same note.
const NOTE_BOX = {
  fontSize: 10, lineHeight: 1.4, color: '#111111', background: '#ffffff',
  border: '1px solid #111111', borderRadius: 0, padding: '3px 6px',
  fontFamily: 'inherit', textAlign: 'left', boxSizing: 'border-box',
}

function NodeNote({ id, note }) {
  const onNoteChange = useContext(NoteEditContext)
  const showNotes = useContext(ShowNotesContext)
  const canEdit = typeof onNoteChange === 'function'
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const cancelled = useRef(false)
  // Hidden means hidden: the owner's "+ note" ghost goes too, or turning notes
  // off would still leave a row of empty placeholders under the diagram.
  // Hooks run first - the early return has to come after them.
  if (!showNotes) return null
  if (!note && !canEdit) return null

  const startEdit = e => { e.stopPropagation(); cancelled.current = false; setDraft(note); setEditing(true) }
  const commit = () => {
    setEditing(false)
    if (cancelled.current) { cancelled.current = false; return }
    const next = cleanNote(draft)
    if (next !== note) onNoteChange(id, next)
  }
  // nodrag/nopan: typing, selecting and double-clicking here must never move
  // the card or zoom the canvas.
  return (
    <div className="nodrag nopan nowheel" onDoubleClick={e => e.stopPropagation()}
      style={{ position: 'absolute', top: '100%', left: -1, marginTop: 5, width: 'calc(100% + 2px)', textAlign: 'left' }}>
      {editing ? (
        <textarea autoFocus rows={3} value={draft} maxLength={NOTE_MAX} placeholder="What happens at this step?"
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur() }
            if (e.key === 'Escape') { cancelled.current = true; e.currentTarget.blur() }
          }}
          style={{ ...NOTE_BOX, fontSize: 16, lineHeight: 1.35, width: '100%', resize: 'none', outline: 'none', display: 'block' }} />
      ) : note ? (
        <div title={canEdit ? `${note}\n\nDouble-click to edit` : note} onDoubleClick={canEdit ? startEdit : undefined}
          style={{ ...NOTE_BOX, display: 'inline-block', maxWidth: '100%', cursor: canEdit ? 'text' : 'default', ...CLAMP_3 }}>{note}</div>
      ) : (
        <button type="button" className="sd-note-add" onClick={startEdit} title="Add a note to this step"
          style={{ ...NOTE_BOX, color: '#6b7280', borderStyle: 'dashed', borderColor: '#9ca3af', cursor: 'pointer', fontWeight: 600 }}>+ note</button>
      )}
    </div>
  )
}

export const AwsNode = memo(function AwsNode({ data }) {
  const svc = findService(data)
  const color = svc.color || '#6b7280'
  const label = svc.label || data.label || data.id
  const note = cleanNote(data.note)

  return (
    <div style={{
      // Tint blended over solid white: an opaque card hides any edge routed
      // beneath it, so a line never appears to run through a box.
      background: `linear-gradient(${color}14, ${color}14), #ffffff`, border: `1px solid ${color}`, borderRadius: 0,
      // A node is a fixed-size card, not a text box. A label or sub carrying a
      // whole sentence used to stretch one card several times wider - and then,
      // once width was capped, several times TALLER - than its neighbours. Both
      // are now bounded and clamped, so every card reads the same size and the
      // full text stays available on hover.
      padding: '12px 16px', minWidth: 130, maxWidth: 180,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', gap: 7, position: 'relative',
      boxShadow: '0 1px 3px rgba(0,0,0,0.10)',
    }}>
      <Handle type="target" position={Position.Left}   style={{ opacity: 0, pointerEvents: 'none' }} />
      <Handle type="target" position={Position.Top}    style={{ opacity: 0, pointerEvents: 'none' }} />
      <Handle type="source" position={Position.Right}  style={{ opacity: 0, pointerEvents: 'none' }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, pointerEvents: 'none' }} />
      {/* Logo only - no frame, never an emoji. Every known service has an icon;
          the letter fallback only guards against a bad id the gate should reject. */}
      {svc.icon
        ? <img src={svc.icon} alt={label} width={48} height={48} style={{ objectFit: 'contain', marginTop: 2 }} />
        : <span style={{ fontSize: 26, fontWeight: 700, color, marginTop: 2, lineHeight: 1 }}>{label[0]?.toUpperCase()}</span>
      }
      <div style={{ textAlign: 'center', width: '100%' }}>
        <div title={label} style={{
          fontSize: 12, fontWeight: 700, color: '#111827', letterSpacing: '-0.1px', lineHeight: 1.3,
          ...CLAMP_2,
        }}>{label}</div>
        {svc.sub && <div title={svc.sub} style={{
          fontSize: 10, color: '#6b7280', marginTop: 2, fontWeight: 600, lineHeight: 1.35,
          ...CLAMP_2,
        }}>{svc.sub}</div>}
      </div>
      <NodeNote id={data.id} note={note} />
    </div>
  )
})

// ─── Start marker node ─────────────────────────────────────────────────────────
// A pill arrowed into the entry node - clearer than a badge stuck on the node.
// It sits ABOVE that node when there is room, pointing down, and falls back to
// sitting on its left, pointing right.
export const MarkerNode = memo(function MarkerNode({ data }) {
  const color = '#16a34a'
  // The arrow is drawn as part of the node rather than as a React Flow edge -
  // more reliable for a node the app adds on the fly.
  // One connector per direction. The pill sits ~60px off the node, so each head
  // stops at 51 - the arrow lands just outside the box, never through its border.
  const VERT = { position: 'absolute', left: '50%', transform: 'translateX(-50%)', overflow: 'visible' }
  const HORZ = { position: 'absolute', top: '50%', transform: 'translateY(-50%)', overflow: 'visible' }
  const stroke = { stroke: color, strokeWidth: 1.5, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }
  const connector = {
    down: (
      <svg width="12" height="56" viewBox="0 0 12 56" style={{ ...VERT, top: '100%' }}>
        <line className="sd-marker-line" x1="6" y1="0" x2="6" y2="44" stroke={color} strokeWidth="1.5" />
        <path d="M2.5 44 L6 51 L9.5 44" {...stroke} />
      </svg>
    ),
    up: (
      <svg width="12" height="56" viewBox="0 0 12 56" style={{ ...VERT, bottom: '100%' }}>
        <line className="sd-marker-line" x1="6" y1="56" x2="6" y2="12" stroke={color} strokeWidth="1.5" />
        <path d="M2.5 12 L6 5 L9.5 12" {...stroke} />
      </svg>
    ),
    right: (
      <svg width="70" height="12" viewBox="0 0 70 12" style={{ ...HORZ, left: '100%' }}>
        <line className="sd-marker-line" x1="0" y1="6" x2="60" y2="6" stroke={color} strokeWidth="1.5" />
        <path d="M60 2.5 L67 6 L60 9.5" {...stroke} />
      </svg>
    ),
    left: (
      <svg width="70" height="12" viewBox="0 0 70 12" style={{ ...HORZ, right: '100%' }}>
        <line className="sd-marker-line" x1="70" y1="6" x2="10" y2="6" stroke={color} strokeWidth="1.5" />
        <path d="M10 2.5 L3 6 L10 9.5" {...stroke} />
      </svg>
    ),
  }[data.dir || 'right']

  return (
    <div style={{
      position: 'relative', display: 'flex', alignItems: 'center', gap: 7,
      background: '#ffffff', border: `2px solid ${color}`, borderRadius: 999,
      padding: '6px 13px 6px 7px', boxShadow: `0 2px 6px ${color}33`, whiteSpace: 'nowrap',
    }}>
      {connector}
      <span style={{ width: 22, height: 22, borderRadius: '50%', background: color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
      </span>
      <span style={{ fontSize: 11, fontWeight: 800, color, letterSpacing: '0.03em' }}>Start here</span>
    </div>
  )
})

// eslint-disable-next-line react-refresh/only-export-components -- nodeTypes must live alongside AwsNode for <ReactFlow nodeTypes={nodeTypes}>
export const nodeTypes = { awsNode: AwsNode, marker: MarkerNode }
