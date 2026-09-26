import { useState, useRef, useEffect } from 'react'
import { relativeTime } from '../timeAgo'
import { DiagramMinimap } from './DiagramMinimap'
import { brandFor } from '../brands'
import { tierFor } from '../difficulty.js'

// ─── Card ─────────────────────────────────────────────────────────────────────


// isPrivate: owner's gallery only - a small lock so a diagram that is not yet
// shareable is obvious before its link goes anywhere.
export function DiagramCard({ id, diagram, title, updatedAt, showBrand, difficulty, onOpen, onViewCode, onDelete, isPrivate, isLocked }) {
  const brand = showBrand ? brandFor(title) : null
  const tier = tierFor(difficulty)
  const [active, setActive] = useState(false) // hover OR keyboard focus (for the card's own lift)
  const [confirming, setConfirming] = useState(false) // delete: awaiting the confirm click
  const confirmTimer = useRef(null)

  useEffect(() => () => { if (confirmTimer.current) clearTimeout(confirmTimer.current) }, [])

  function handleDeleteClick(e) {
    e.stopPropagation()
    if (confirming) {
      if (confirmTimer.current) clearTimeout(confirmTimer.current)
      setConfirming(false)
      onDelete()
      return
    }
    setConfirming(true)
    confirmTimer.current = setTimeout(() => setConfirming(false), 3000)
  }

  function resetConfirm() {
    if (confirmTimer.current) clearTimeout(confirmTimer.current)
    setConfirming(false)
  }

  return (
    <div
      className="dc-card"
      data-flow-id={id}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setActive(false) }}
      style={{
        background: '#ffffff', borderRadius: 14, overflow: 'hidden', cursor: 'pointer',
        transition: 'box-shadow 0.15s, transform 0.15s',
        border: active ? '2px solid #1c1e21' : '2px solid transparent',
        boxShadow: active ? '0 8px 28px rgba(0,0,0,0.18), 0 0 0 3px rgba(28,30,33,0.08)' : '0 1px 4px rgba(0,0,0,0.05)',
        transform: active ? 'translateY(-2px)' : 'translateY(0)',
        position: 'relative',
      }}
    >
      {/* Actions are shown on hover / keyboard focus, and ALWAYS on touch devices
          (coarse pointers can't hover) - CSS so it works without pointer events. */}
      <style>{`
        .dc-card .dc-actions { opacity: 0; pointer-events: none; transition: opacity .12s ease; }
        .dc-card:hover .dc-actions, .dc-card:focus-within .dc-actions { opacity: 1; pointer-events: auto; }
        @media (hover: none) { .dc-card .dc-actions { opacity: 1; pointer-events: auto; } }
      `}</style>

      {/* Full-bleed transparent overlay button - the actual open control. Sits
          below .dc-actions in stacking order so the action buttons stay clickable
          and are no longer nested inside an interactive element (a11y fix). */}
      <button
        className="dc-open"
        aria-label={`Open ${title}`}
        onClick={onOpen}
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          border: 'none', background: 'transparent', cursor: 'pointer',
          padding: 0, margin: 0, zIndex: 1,
        }}
      />

      {/* Header */}
      <div style={{ padding: '13px 14px 8px', display: 'flex', alignItems: 'flex-start', gap: 11 }}>
        {brand && (
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 42, height: 42, borderRadius: 10, background: '#ffffff', border: '1px solid #e7e9ee', flexShrink: 0 }}>
            <img src={brand.icon} alt="" width={28} height={28} style={{ objectFit: 'contain', display: 'block' }} />
          </span>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: brand ? 13 : 12, fontWeight: 700, color: '#1c1e21', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5 }}>
            {isPrivate && (
              <span className="dc-private" title="Private: only you can open it. Open it and click the Private pill, or Share, to publish." style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: 5, background: '#fffbeb', border: '1px solid #fde68a', color: '#b45309', flexShrink: 0 }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </span>
            )}
            {isLocked && (
              <span className="dc-locked" title="Locked: embedded in a README or Confluence page. It cannot be deleted until unlocked." style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: 5, background: '#fef3c7', border: '1px solid #fde68a', color: '#92400e', flexShrink: 0 }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </span>
            )}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
          </div>
          {brand && <div style={{ fontSize: 11, color: '#65676b', marginTop: 2 }}>{brand.sub}</div>}
        </div>
        <span style={{ fontSize: 10, color: '#65676b', flexShrink: 0, alignSelf: 'flex-start', marginTop: 1 }}>{relativeTime(updatedAt)}</span>
      </div>

      {/* Node / edge counts */}
      <div style={{ padding: '0 13px 8px', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 9, fontWeight: 500, padding: '1px 6px', borderRadius: 20, background: '#eef2f7', color: '#475569', border: '1px solid #e3e8ee', letterSpacing: '0.01em', lineHeight: 1.5 }}>
          {diagram.nodes.length} {diagram.nodes.length === 1 ? 'node' : 'nodes'}
        </span>
        <span style={{ fontSize: 9, fontWeight: 500, padding: '1px 6px', borderRadius: 20, background: '#eef2f7', color: '#475569', border: '1px solid #e3e8ee', letterSpacing: '0.01em', lineHeight: 1.5 }}>
          {diagram.edges.length} {diagram.edges.length === 1 ? 'edge' : 'edges'}
        </span>
        {tier && (
          <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 20, background: tier.bg, color: tier.fg, border: `1px solid ${tier.bd}`, letterSpacing: '0.01em', lineHeight: 1.5 }}>
            {tier.label}
          </span>
        )}
      </div>

      {/* Minimap */}
      <div style={{ padding: '0 12px 13px' }}>
        <DiagramMinimap diagram={diagram} />
      </div>

      {/* Actions (visibility handled by the CSS above) */}
      <div className="dc-actions" style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 4, zIndex: 2 }} onClick={e => e.stopPropagation()}>
        {onViewCode && <button onClick={onViewCode} title="View code" aria-label="View code"
          style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid #e4e6e8', background: '#ffffff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#65676b" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
          </svg>
        </button>}
        {onDelete && !isLocked && (confirming ? (
          <button onClick={handleDeleteClick} onBlur={resetConfirm} title="Confirm delete"
            style={{ height: 26, borderRadius: 7, border: '1px solid #dc2626', background: '#dc2626', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px', fontSize: 10, fontWeight: 700, color: '#ffffff', whiteSpace: 'nowrap', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
            Delete?
          </button>
        ) : (
          <button onClick={handleDeleteClick} title="Delete" aria-label="Delete"
            style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid #e4e6e8', background: '#ffffff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
          </button>
        ))}
      </div>
    </div>
  )
}
