import { memo, useContext, useEffect, useRef, useState } from 'react'
import { Handle, Position, NodeResizer, useReactFlow } from '@xyflow/react'
import { findService } from '../services'
import { NoteEditContext, InfoEditContext, NodeResizeContext, IconResizeContext, ShowNotesContext, setNoteHeight } from './noteEditContext'
import { NOTE_MAX, cleanNote, noteParts, linkLabel, INFO_MAX, cleanInfo, infoLead } from '../note'
import { SUNSET, INK } from '../sunset.js'
import { FONT_STACK, borderStyleOf } from '../style.js'

// An unstretched logo fills whatever the card leaves above its label, about
// 120px of a 180px card, so it reads as the card's subject even when Fit
// shrinks the diagram. ICON is only the fallback when the box cannot be measured.
const ICON = 120

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

const CLAMP_10 = { ...CLAMP_2, WebkitLineClamp: 10 }

// The bordered caption hanging off a card's bottom-left corner. Plain black
// text in a black frame, any URL in it a blue link, clamped to 10 lines with the full note on hover. The
// owner double-clicks it (or the "+ note" ghost on an empty card) to edit;
// everyone else just reads it, so a shared link shows exactly the same note.
// The gap between the card's bottom edge and the note box (marginTop below),
// plus the daylight kept UNDER the box. A connector that starts exactly on the
// note's bottom border reads as a line running into the box - which is the one
// thing this whole measurement exists to prevent - so the published extent
// carries its own clearance and every consumer inherits it.
const NOTE_GAP = 5
const NOTE_CLEAR = 14

const NOTE_BOX = {
  fontSize: 10, lineHeight: 1.4, color: '#111111', background: '#ffffff',
  border: '1px solid #111111', borderRadius: 0, padding: '3px 6px',
  fontFamily: 'inherit', textAlign: 'left', boxSizing: 'border-box',
}

// The editor inherits NOTE_BOX whole - same 10px, same line height - so
// clicking a note does not resize the text under the cursor. It used to jump to
// 16px, which is the iOS no-zoom floor; that floor now lives in a media query
// on .sd-note-edit (DetailView.jsx) where it only costs touch devices. The box
// itself drags taller, since a 400-character note does not fit 3 rows.
function NodeNote({ id, note }) {
  const onNoteChange = useContext(NoteEditContext)
  const showNotes = useContext(ShowNotesContext)
  const canEdit = typeof onNoteChange === 'function'
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const cancelled = useRef(false)
  // Published so an edge routes around this box instead of under it - see
  // setNoteHeight in noteEditContext. offsetHeight, not getBoundingClientRect:
  // the canvas is a CSS transform, and only offsetHeight is in the same
  // unzoomed units the node positions are. A note re-wraps when the card is
  // resized or the text is edited, so it is observed rather than measured once.
  const boxRef = useRef(null)
  useEffect(() => {
    const box = boxRef.current
    if (!box) { setNoteHeight(id, 0); return undefined }
    const publish = () => setNoteHeight(id, box.offsetHeight + NOTE_GAP + NOTE_CLEAR)
    publish()
    const ro = new ResizeObserver(publish)
    ro.observe(box)
    return () => { ro.disconnect(); setNoteHeight(id, 0) }
  })

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
  // the card. nowheel only while editing, so the textarea scrolls; otherwise
  // 2 fingers over a note must pan and pinch the canvas like anywhere else.

  return (
    <div ref={boxRef} className={editing ? 'sd-note-box nodrag nopan nowheel' : 'sd-note-box nodrag nopan'} onDoubleClick={e => e.stopPropagation()}
      style={{ position: 'absolute', top: '100%', left: -1, marginTop: 5, width: 'calc(100% + 2px)', textAlign: 'left' }}>
      {editing ? (
        <textarea autoFocus rows={10} value={draft} maxLength={NOTE_MAX} placeholder="What happens at this step?"
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur() }
            if (e.key === 'Escape') { cancelled.current = true; e.currentTarget.blur() }
          }}
          className="sd-note-edit"
          style={{ ...NOTE_BOX, width: '100%', minHeight: 60, resize: 'vertical', outline: 'none', display: 'block' }} />
      ) : note ? (
        <div title={canEdit ? `${note}\n\nDouble-click to edit` : note} onDoubleClick={canEdit ? startEdit : undefined}
          style={{ ...NOTE_BOX, display: 'inline-block', maxWidth: '100%', cursor: canEdit ? 'text' : 'default', ...CLAMP_10 }}>
          {noteParts(note).map((part, i) => part.url
            ? <a key={i} href={part.url} title={part.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                style={{ color: '#1d4ed8', textDecoration: 'underline', whiteSpace: 'nowrap' }}>{linkLabel(part.url)}</a>
            : <span key={i}>{part.text}</span>)}
        </div>
      ) : (
        <button type="button" className="sd-note-add" onClick={startEdit} title="Add a note to this step"
          style={{ ...NOTE_BOX, color: '#6b7280', borderStyle: 'dashed', borderColor: '#9ca3af', cursor: 'pointer', fontWeight: 600 }}>+ note</button>
      )}
    </div>
  )
}

// The i badge at a card's top-right corner. Info is what this thing is and why
// it is in the diagram (the note under the card is what the step does). It
// stays hidden until the reader hovers or clicks the badge, so a dense diagram
// never grows a paragraph on every box. The owner double-clicks the text to
// edit it; a card with no info shows no badge at all (info arrives through the
// API). The popover opens above the card, so it never covers the card's own
// icon or label, and it touches the badge so hovering into it keeps it open.
// Only 1 info popover stays open at a time. Opening one announces its card id
// here and every other badge closes on hearing it, so a reader stepping through
// a diagram never ends up with 3 paragraphs stacked over the boxes.
const INFO_OPENED = new EventTarget()

function NodeInfo({ id, label, info, color }) {
  const onInfoChange = useContext(InfoEditContext)
  const canEdit = typeof onInfoChange === 'function'
  const [hover, setHover] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const cancelled = useRef(false)
  useEffect(() => {
    const onOther = e => { if (e.detail !== id) { setPinned(false); setEditing(false) } }
    INFO_OPENED.addEventListener('open', onOther)
    return () => INFO_OPENED.removeEventListener('open', onOther)
  }, [id])
  if (!info) return null
  const show = hover || pinned || editing
  const announce = () => INFO_OPENED.dispatchEvent(new CustomEvent('open', { detail: id }))
  const startEdit = e => { e.stopPropagation(); cancelled.current = false; setDraft(info || ''); announce(); setEditing(true); setPinned(true) }
  const commit = () => {
    setEditing(false); setPinned(false)
    if (cancelled.current) { cancelled.current = false; return }
    const next = cleanInfo(draft)
    if (next !== (info || '')) onInfoChange(id, next)
  }
  const toggle = e => { e.stopPropagation(); if (!pinned) announce(); setPinned(!pinned) }
  const lit = pinned || editing
  return (
    <div className="nodrag nopan" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onDoubleClick={e => e.stopPropagation()} style={{ position: 'absolute', top: 4, right: 4, zIndex: 4 }}>
      <button type="button" onClick={toggle} aria-label="What this is and why it is here" aria-expanded={show}
        style={{ width: 16, height: 16, borderRadius: '50%', border: `1px solid ${color}`, padding: 0, cursor: 'pointer',
          background: lit ? color : '#ffffff', color: lit ? '#ffffff' : color,
          fontFamily: 'Georgia, serif', fontStyle: 'italic', fontWeight: 700, fontSize: 10, lineHeight: 1 }}>i</button>
      {show && (
        <div className={editing ? 'nowheel' : undefined} style={{ position: 'absolute', bottom: 14, right: 0, width: 260, zIndex: 5,
          background: '#ffffff', color: '#1a2129', border: `1px solid ${color}`, boxShadow: '0 4px 14px rgba(0,0,0,0.14)',
          padding: '8px 10px', fontSize: 12, fontWeight: 500, lineHeight: 1.45, textAlign: 'left', whiteSpace: 'pre-wrap', cursor: 'default' }}>
          {editing ? (
            <textarea autoFocus rows={6} value={draft} maxLength={INFO_MAX} placeholder="What is this, and why is it here?"
              onChange={e => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur() }
                if (e.key === 'Escape') { cancelled.current = true; e.currentTarget.blur() }
              }}
              style={{ width: '100%', fontSize: 16, lineHeight: 1.35, fontFamily: 'inherit', border: 0, outline: 'none', resize: 'none', display: 'block', background: 'transparent' }} />
          ) : (
            <div onDoubleClick={canEdit ? startEdit : undefined} title={canEdit ? 'Double-click to edit' : undefined}>
              <strong>{infoLead(label, info).name}</strong>{infoLead(label, info).rest}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export const AwsNode = memo(function AwsNode({ data, selected }) {
  const svc = findService(data)
  // Sunset: today's path, about to be unplugged. The card goes light silver
  // and dimmed, the icon greyscale. No red X on the card: the X marks the
  // badges only. Silver is reserved for this state, so a node with no colour
  // of its own is ink, never grey.
  const sunset = data.sunset === true
  // The format panel's overrides. Sunset still wins on colour: silver is the
  // one state the whole app reads at a glance, so a styled card that is on its
  // way out still looks like it (src/sunset.js).
  const st = data.style || {}
  const color = sunset ? SUNSET.border : (st.stroke || svc.color || INK)
  const label = svc.label || data.label || data.id
  const sub = svc.sub || data.sub
  const note = cleanNote(data.note)
  // A picture node: `image` is always the inlined 640x480 JPEG data URI
  // resolved at create/update time - never a raw path, URL or airclips: ref.
  const picture = typeof data.image === 'string' && data.image.startsWith('data:image/') ? data.image : null
  // The owner's resize handler, or null on a shared/read-only view - absence
  // is what hides the resize handles below.
  const onResize = useContext(NodeResizeContext)
  const canResize = typeof onResize === 'function'
  // The owner's saved size, or the shape's default when never resized.
  const size = data.size
  // Dragging a corner moves the handle, but React Flow does not resize the
  // node's own box until the drag ends - without this the card sits still
  // while the outline runs ahead of it. `live` tracks the frame the drag is
  // currently on; onResizeEnd both commits it and clears the override.
  const [live, setLive] = useState(null)
  const box = live || size

  // The icon/photo INSIDE the card, resized independently of the card itself
  // by dragging the small handle at its own corner. Same live/committed split
  // as the card's own resize above.
  const onIconResize = useContext(IconResizeContext)
  const [liveIcon, setLiveIcon] = useState(null)
  const iconBox = liveIcon || data.iconSize
  const imgRef = useRef(null)
  const { getZoom } = useReactFlow()

  const startIconDrag = e => {
    if (!onIconResize || e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    const zoom = getZoom() || 1
    const rect = imgRef.current?.getBoundingClientRect()
    const start = iconBox || (rect ? { w: rect.width / zoom, h: rect.height / zoom } : { w: ICON, h: ICON })
    const ratio = start.w / (start.h || 1)
    const x0 = e.clientX, y0 = e.clientY
    let last = null
    const move = ev => {
      let w = start.w + (ev.clientX - x0) / zoom
      let h = ev.shiftKey ? w / ratio : start.h + (ev.clientY - y0) / zoom
      w = Math.min(600, Math.max(16, w))
      h = Math.min(600, Math.max(16, h))
      last = { w: Math.round(w), h: Math.round(h) }
      setLiveIcon(last)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      const saved = data.iconSize
      if (last && (!saved || saved.w !== last.w || saved.h !== last.h)) onIconResize(data.id, last)
      setLiveIcon(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const iconHandle = onIconResize && selected && (
    <span className="nodrag nopan" onPointerDown={startIconDrag}
      onDoubleClick={e => { e.stopPropagation(); onIconResize(data.id, null) }}
      title="Drag to stretch the icon; double-click to reset"
      style={{ position: 'absolute', right: -6, bottom: -6, width: 10, height: 10, background: color, border: '1px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,0.2)', cursor: 'nwse-resize', zIndex: 3 }} />
  )
  // Shared by both the icon and picture wrap: a picture with no custom size
  // still needs `flex: 1` on the wrapper (not just the img) to fill the card,
  // exactly as the un-wrapped img did before.
  // The ring marks the icon box whenever its drag handle is shown, so what the
  // handle stretches is visible. outline, not border, so the layout never moves.
  const iconWrapStyle = { position: 'relative', display: 'inline-flex', justifyContent: 'center', maxWidth: '100%', minHeight: 0, ...(iconBox ? { flex: '0 1 auto' } : { flex: 1, width: '100%' }),
    ...(iconHandle ? { outline: `1px dashed ${color}`, outlineOffset: 2 } : {}) }

  return (
    <div style={{
      // Tint blended over solid white: an opaque card hides any edge routed
      // beneath it, so a line never appears to run through a box.
      // An explicit background is taken flat: it was picked to be that colour,
      // not to be an 8% wash of it. "transparent" still paints white, because
      // an opaque card is what keeps a line from appearing to run through it.
      background: sunset ? SUNSET.tint
        : st.bg ? (st.bg === 'transparent' ? '#ffffff' : st.bg)
        : `linear-gradient(${color}14, ${color}14), #ffffff`,
      border: `${st.bw || 1}px ${borderStyleOf(st.bs)} ${color}`, borderRadius: st.radius || 0,
      opacity: st.opacity == null ? 1 : st.opacity / 100,
      // A node is a fixed-size box the owner can resize by dragging a corner. A
      // label or sub carrying a whole sentence is bounded and clamped inside it
      // rather than stretching the card, so every unresized card reads the same
      // size and the full text stays available on hover.
      width: box ? box.w : (picture ? 240 : 180), height: box ? box.h : (picture ? 225 : 180),
      // The same 10px inside every edge; the logo or photo fills the room the
      // label leaves, and the text is never squeezed - see flex: none below.
      padding: 10, boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 6, position: 'relative',
      boxShadow: '0 1px 3px rgba(0,0,0,0.10)',
    }}>
      {canResize && <NodeResizer isVisible={selected} minWidth={130} minHeight={130} maxWidth={600} maxHeight={600} keepAspectRatio={!!picture}
        lineStyle={{ borderColor: color, borderWidth: 1 }}
        handleStyle={{ width: 9, height: 9, borderRadius: 0, background: color, border: '1px solid #fff' }}
        onResize={(_, p) => setLive({ w: p.width, h: p.height })}
        onResizeEnd={(_, p) => { onResize(data.id, { w: Math.round(p.width), h: Math.round(p.height) }); setLive(null) }} />}
      <Handle type="target" position={Position.Left}   style={{ opacity: 0, pointerEvents: 'none' }} />
      <Handle type="target" position={Position.Top}    style={{ opacity: 0, pointerEvents: 'none' }} />
      <Handle type="source" position={Position.Right}  style={{ opacity: 0, pointerEvents: 'none' }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, pointerEvents: 'none' }} />
      {/* Logo only - no frame, never an emoji. Every known service has an icon;
          the letter fallback only guards against a bad id the gate should reject. */}
      {picture
        ? <span style={iconWrapStyle}>
            <img ref={imgRef} src={picture} alt={label} style={{ ...(iconBox
              ? { width: iconBox.w, height: iconBox.h, maxWidth: '100%', flex: 'none', objectFit: 'cover', display: 'block', borderRadius: 2 }
              : { width: '100%', flex: 1, minHeight: 0, objectFit: 'cover', display: 'block', borderRadius: 2 }), ...(sunset ? { filter: 'grayscale(1) opacity(0.55)' } : {}) }} />
            {iconHandle}
          </span>
        : svc.icon
        ? <span style={iconWrapStyle}>
            <img ref={imgRef} src={svc.icon} alt={label} {...(iconBox ? { width: iconBox.w, height: iconBox.h } : {})}
              style={{ ...(iconBox
                ? { objectFit: 'contain', maxWidth: '100%', maxHeight: '100%' }
                : { width: 'auto', height: '100%', maxWidth: '100%', objectFit: 'contain', display: 'block' }), ...(sunset ? { filter: 'grayscale(1) opacity(0.55)' } : {}) }} />
            {iconHandle}
          </span>
        : <span style={{ fontSize: 26, fontWeight: 700, color, marginTop: 2, lineHeight: 1 }}>{label[0]?.toUpperCase()}</span>
      }
      <div style={{ textAlign: st.align || 'center', width: '100%', flex: 'none', fontFamily: FONT_STACK[st.font] || 'inherit' }}>
        <div title={label} style={{
          fontSize: st.fs || 12, fontWeight: 700, color: sunset ? SUNSET.ink : '#111827', letterSpacing: '-0.1px', lineHeight: 1.3,
          ...CLAMP_2,
        }}>{label}</div>
        {sub && <div title={sub} style={{
          // The sub stays proportional to the label rather than fixed at 10px,
          // so bumping the card to XL does not leave a caption the same size.
          fontSize: st.fs ? Math.round(st.fs * 0.82) : 10, color: sunset ? SUNSET.ink : '#6b7280', marginTop: 2, fontWeight: 600, lineHeight: 1.35,
          ...CLAMP_2,
        }}>{sub}</div>}
      </div>
      <NodeInfo id={data.id} label={label} info={data.info} color={color} />
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
