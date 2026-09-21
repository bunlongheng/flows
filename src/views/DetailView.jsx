import { useState, useEffect, useRef } from 'react'
import { ReactFlow, Background } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import diagramData from '../data/diagram.json'
import ImportFormatsModal from '../components/ImportFormatsModal'
import { nodeTypes } from '../components/AwsNode'
import { NoteEditContext } from '../components/noteEditContext'
import { edgeTypes } from '../components/GradientEdge'
import { Toast } from '../components/Toast'
import { SnapGuides } from '../components/SnapGuides'
import { Footer } from '../components/Footer'
import { brandFor } from '../brands'

// Below this width the summary card starts folded and the canvas is the page.
const PHONE_MAX_WIDTH = 640

// ─── Detail (canvas) view ───────────────────────────────────────────────────

export function DetailView({
  toast,
  setView,
  showDetailCode, setShowDetailCode,
  rfInstance: rfInstanceRef, flashZoomHud, zoomHudRef,
  showSharePanel, setShowSharePanel,
  showDetailsPanel, setShowDetailsPanel,
  steps = [],
  showSteps, setShowSteps,
  badgeMode, setBadgeMode,
  activeDiagram,
  detailCodeCopied, setDetailCodeCopied,
  nodes, edges, onNodesChange, onNodeDragStop, snapGuides = [],
  exportPng, exportWebp, exportGif, exportCode, exportJson, copyLink, copiedLink, shareAction, copiedShare, copyCode, copiedCode,
  shareSlug, shareUrl,
  showDocs, setShowDocs, copiedLabel, onCopyFormat,
  showToastMsg,
  isPublic,
  saveState = 'idle',
  onArrange,
  canUndo, canRedo, onUndo, onRedo,
  onDeleteDiagram,
  // (nodeId, note) => void when the owner is signed in; undefined otherwise,
  // which makes every node note read-only (shared links, /demo).
  onNoteChange,
  // Owner only: is the open diagram public, and a click to flip it. Undefined
  // for anyone else, which hides the pill.
  isDiagramPublic, onToggleVisibility,
  // A visitor on /demo or a shared link sees the diagram exactly as the owner
  // left it: nodes are locked, and the tools that change or take a copy of it
  // (Arrange, Undo/Redo, Code, Share, every export) are not rendered. They keep
  // Fit, Details, Steps and the badge style - reading aids that cannot break
  // the layout. Too much freedom on a showcase only makes it look broken.
  canEdit = true,
  // Owner only: publish the moment the Share panel opens, so the pill flips and
  // the preview shows the real card right then - not after Copy link.
  onShareOpen,
}) {
  const brand = brandFor(activeDiagram?.title)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // The info card sits over the canvas. On a phone it covers a third of the
  // diagram, so one tap folds it down to a small badge in the same corner.
  const [infoOpen, setInfoOpen] = useState(() => typeof window === 'undefined' || window.innerWidth > PHONE_MAX_WIDTH)
  // Fit is an ACTION, but it reads as a state on touch (the inline hover
  // background never clears without a mouseleave). So make the state real:
  // lit only while the canvas actually IS the fitted view, cleared the moment
  // you pan or zoom away from it.
  const [fitted, setFitted] = useState(true)
  const fitNow = () => {
    rfInstanceRef.current?.fitView({ padding: 0.12, duration: 400 })
    setFitted(true)
  }

  // Opening or closing a side panel changes how much canvas the diagram has, so
  // whatever was fitted a moment ago no longer is. Re-fit on every toggle, in
  // both directions, after a tick so the panel's width is already applied.
  //
  // NOT on mount: onInit already fits, and firing a second animated fitView on
  // top of it left the viewport still settling - enough to shift a drag by half
  // a pixel and break the snap-align spec.
  // Rotating a phone changes the canvas shape, so the old fit is wrong the
  // moment it happens. Re-fit on resize/rotate, but only while the view IS the
  // fitted one - someone who has pinched in keeps their zoom.
  const fittedRef = useRef(true)
  useEffect(() => { fittedRef.current = fitted }, [fitted])
  useEffect(() => {
    let t
    const refit = () => {
      clearTimeout(t)
      t = setTimeout(() => {
        if (!fittedRef.current) return
        rfInstanceRef.current?.fitView({ padding: 0.15, duration: 300 })
        setFitted(true)
      }, 180)
    }
    window.addEventListener('resize', refit)
    window.addEventListener('orientationchange', refit)
    return () => { clearTimeout(t); window.removeEventListener('resize', refit); window.removeEventListener('orientationchange', refit) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const didMountFit = useRef(false)
  useEffect(() => {
    if (!didMountFit.current) { didMountFit.current = true; return }
    const t = setTimeout(fitNow, 60)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDetailsPanel, showSteps, showSharePanel, showDetailCode])
  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}>
      <Toast message={toast.message} visible={toast.visible} />

      {/* Header - diagrams-style floating pill toolbar. Scrolls horizontally on
          narrow screens so every action stays reachable instead of clipping. */}
      <header className="sd-detail-header" style={{
        height: 54, background: 'linear-gradient(180deg, #fbfbfc 0%, #eef0f3 100%)', borderBottom: '1px solid #e4e7ea',
        display: 'flex', alignItems: 'center', padding: '0 16px', paddingTop: 'env(safe-area-inset-top)', boxSizing: 'content-box', gap: 10, flexShrink: 0,
        overflowX: 'auto', overflowY: 'hidden', WebkitOverflowScrolling: 'touch',
      }}>
        {/* Back button */}
        <button onClick={() => { setView('index'); setShowDetailCode(false); }}
          aria-label="Back to gallery"
          style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            border: '1px solid #e4e6e8', background: '#ffffff',
            boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
            color: '#64748b', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.1s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#e9ecef')}
          onMouseLeave={e => (e.currentTarget.style.background = '#ffffff')}
        >
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>

        {/* Diagram name (with brand logo, matching the card) */}
        {/* Same tile as the Back button beside it - 36px, radius 10, same border -
            so the 2 marks at the start of the bar read as one pair. */}
        {brand && (
          <span className="sd-brand-tile" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 10, background: '#ffffff', border: '1px solid #e4e6e8', flexShrink: 0 }}>
            <img src={brand.icon} alt="" width={16} height={16} style={{ objectFit: 'contain' }} />
          </span>
        )}
        <span className="sd-detail-title" style={{ fontSize: 15, fontWeight: 700, color: '#1c1e21', letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
          {activeDiagram?.title || 'Untitled diagram'}
        </span>

        {/* Visibility pill, owner only. The owner can open every diagram, so a
            private one looks shared when it is not - the recipient gets a 404
            and Slack a generic card. This says which it is, and flips it. */}
        {onToggleVisibility && (
          <button type="button" className="sd-visibility" data-public={isDiagramPublic ? '1' : '0'}
            role="switch" aria-checked={isDiagramPublic} aria-label={isDiagramPublic ? 'Public: anyone with the link can open it' : 'Private: only you can open it'}
            onClick={onToggleVisibility}
            title={isDiagramPublic
              ? 'Public: anyone with the link can open it, and it previews with the diagram. Click to make it private.'
              : 'Private: only you can open it. Anyone else gets a 404 and a generic preview card. Click to publish.'}
            style={{
              flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5,
              height: 28, padding: '0 10px 0 8px', borderRadius: 999, cursor: 'pointer',
              fontSize: 11, fontWeight: 700, letterSpacing: '0.02em',
              background: isDiagramPublic ? '#ecfdf5' : '#fffbeb',
              color: isDiagramPublic ? '#047857' : '#b45309',
              border: `1px solid ${isDiagramPublic ? '#a7f3d0' : '#fde68a'}`,
            }}>
            {isDiagramPublic
              ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>}
            <span className="sd-vis-label">{isDiagramPublic ? 'Public' : 'Private'}</span>
          </button>
        )}

        {/* Layout save indicator: spinner while saving, green check when saved. */}
        {saveState === 'saving' && (
          <span className="sd-save-spin" title="Saving layout..." style={{ flexShrink: 0, width: 16, height: 16, borderRadius: '50%', border: '2px solid #cbd5e1', borderTopColor: '#1c1e21', display: 'inline-block' }} />
        )}
        {saveState === 'saved' && (
          <span className="sd-save-check" title="Layout saved" style={{ flexShrink: 0, width: 17, height: 17, borderRadius: '50%', background: '#16a34a', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          </span>
        )}

        <div style={{ flex: 1 }} />

        {/* Action toolbar - floating pill */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 2,
          background: '#ffffff', border: '1px solid #e4e6e8', borderRadius: 14,
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '4px 6px',
        }}>
          {/* Code toggle */}
          {canEdit && <button className="sd-hide-mobile" onClick={() => setShowDetailCode(v => !v)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '0 10px', height: 30, borderRadius: 8, border: 'none',
            background: showDetailCode ? '#f1f5f9' : 'transparent',
            color: showDetailCode ? '#1e293b' : '#64748b',
            cursor: 'pointer', fontSize: 13, fontWeight: showDetailCode ? 600 : 400,
            transition: 'all 0.1s', fontFamily: 'inherit',
          }}
            onMouseEnter={e => { if (!showDetailCode) e.currentTarget.style.background = '#f1f5f9' }}
            onMouseLeave={e => { if (!showDetailCode) e.currentTarget.style.background = 'transparent' }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
            </svg>
            <span className="sd-btn-label">Code</span>
          </button>}

          <div className="sd-divider" style={{ width: 1, height: 18, background: '#e4e6e8', flexShrink: 0, margin: '0 2px' }} />

          {/* Fit button */}
          <button className={`sd-hide-mobile sd-show-mobile${fitted ? ' is-on' : ''}`} onClick={fitNow}
            title={fitted ? 'Already fitted to the screen' : 'Fit the diagram to the screen'} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '0 10px', height: 30, borderRadius: 8, border: 'none',
            background: fitted ? '#f1f5f9' : 'transparent', color: fitted ? '#1e293b' : '#64748b',
            cursor: 'pointer', fontSize: 13, fontWeight: fitted ? 600 : 400,
            transition: 'all 0.1s', fontFamily: 'inherit',
          }}
            onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')}
            onMouseLeave={e => (e.currentTarget.style.background = fitted ? '#f1f5f9' : 'transparent')}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
            </svg>
            <span className="sd-btn-label">Fit</span>
          </button>

          <div className="sd-divider" style={{ width: 1, height: 18, background: '#e4e6e8', flexShrink: 0, margin: '0 2px' }} />

          {/* Auto-arrange: re-lay-out left-to-right, spread out, step-ordered, then fit */}
          {canEdit && <button className="sd-hide-mobile sd-show-mobile" onClick={() => onArrange && onArrange()} title="Auto-arrange the layout" style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '0 10px', height: 30, borderRadius: 8, border: 'none',
            background: 'transparent', color: '#64748b',
            cursor: 'pointer', fontSize: 13, fontWeight: 400,
            transition: 'all 0.1s', fontFamily: 'inherit',
          }}
            onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><path d="M10 6.5h4M17.5 10v4M6.5 10v7.5H10"/>
            </svg>
            <span className="sd-btn-label">Arrange</span>
          </button>}

          {/* Undo / redo. They appear once there IS something to undo, so a
              freshly opened diagram keeps a clean toolbar, and each button dims
              when its own direction is empty. */}
          {canEdit && (canUndo || canRedo) && [
            { key: 'undo', label: 'Undo', on: onUndo, enabled: canUndo, hint: 'Undo (Cmd+Z)', d: 'M3 10h13a5 5 0 0 1 0 10h-1M3 10l4-4M3 10l4 4' },
            { key: 'redo', label: 'Redo', on: onRedo, enabled: canRedo, hint: 'Redo (Cmd+Shift+Z)', d: 'M21 10H8a5 5 0 0 0 0 10h1M21 10l-4-4M21 10l-4 4' },
          ].map(b => (
            <button key={b.key} onClick={() => b.enabled && b.on && b.on()} disabled={!b.enabled} title={b.hint}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '0 10px', height: 30, borderRadius: 8, border: 'none',
                background: 'transparent', color: b.enabled ? '#64748b' : '#cbd5e1',
                cursor: b.enabled ? 'pointer' : 'default', fontSize: 13, fontWeight: 400,
                transition: 'all 0.1s', fontFamily: 'inherit', flexShrink: 0,
              }}
              onMouseEnter={e => { if (b.enabled) e.currentTarget.style.background = '#f1f5f9' }}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d={b.d} />
              </svg>
              <span className="sd-btn-label">{b.label}</span>
            </button>
          ))}

          <div className="sd-divider" style={{ width: 1, height: 18, background: '#e4e6e8', flexShrink: 0, margin: '0 2px' }} />

          {/* Details (goal + steps) panel toggle */}
          <button className={`sd-hide-mobile${showDetailsPanel ? ' is-on' : ''}`} onClick={() => setShowDetailsPanel(v => !v)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '0 10px', height: 30, borderRadius: 8, border: 'none',
            background: showDetailsPanel ? '#f1f5f9' : 'transparent',
            color: showDetailsPanel ? '#1e293b' : '#64748b',
            cursor: 'pointer', fontSize: 13, fontWeight: showDetailsPanel ? 600 : 400,
            transition: 'all 0.1s', fontFamily: 'inherit',
          }}
            onMouseEnter={e => { if (!showDetailsPanel) e.currentTarget.style.background = '#f1f5f9' }}
            onMouseLeave={e => { if (!showDetailsPanel) e.currentTarget.style.background = 'transparent' }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
            <span className="sd-btn-label">Details</span>
          </button>

          <div className="sd-divider" style={{ width: 1, height: 18, background: '#e4e6e8', flexShrink: 0, margin: '0 2px' }} />

          {/* Steps toggle */}
          <button className={showSteps ? "is-on" : ""} onClick={() => setShowSteps(v => !v)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '0 10px', height: 30, borderRadius: 8, border: 'none',
            background: showSteps ? '#f1f5f9' : 'transparent',
            color: showSteps ? '#1e293b' : '#64748b',
            cursor: 'pointer', fontSize: 13, fontWeight: showSteps ? 600 : 400,
            transition: 'all 0.1s', fontFamily: 'inherit',
          }}
            onMouseEnter={e => { if (!showSteps) e.currentTarget.style.background = '#f1f5f9' }}
            onMouseLeave={e => { if (!showSteps) e.currentTarget.style.background = 'transparent' }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/>
              <path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>
            </svg>
            <span className="sd-btn-label">Steps</span>
          </button>

          {/* Kept on a phone: Steps and the badge style are the 2 actions left in
              the bar there, and without a line between them they read as 1 control. */}
          <div className="sd-divider sd-divider-phone" style={{ width: 1, height: 18, background: '#e4e6e8', flexShrink: 0, margin: '0 2px' }} />

          {/* Badge style cycle: silver -> color -> dark -> plain */}
          <button onClick={() => {
            const order = ['silver', 'color', 'dark', 'plain']
            setBadgeMode(m => order[(order.indexOf(m) + 1) % order.length])
          }} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '0 10px', height: 30, borderRadius: 8, border: 'none',
            background: 'transparent', color: '#64748b',
            cursor: 'pointer', fontSize: 13, fontWeight: 400,
            transition: 'all 0.1s', fontFamily: 'inherit',
          }}
            onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            title="Cycle badge style"
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>
            </svg>
            <span className="sd-btn-label">{{ silver: 'Silver', color: 'Color', dark: 'Dark', plain: 'Plain' }[badgeMode]}</span>
          </button>

          {canEdit && <div className="sd-divider sd-divider-phone" style={{ width: 1, height: 18, background: '#e4e6e8', flexShrink: 0, margin: '0 2px' }} />}

          {/* Share toggle */}
          {canEdit && <button className={showSharePanel ? "is-on" : ""} onClick={() => { if (!showSharePanel) onShareOpen?.(); setShowSharePanel(v => !v) }} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '0 10px', height: 30, borderRadius: 8, border: 'none',
            background: showSharePanel ? '#f1f5f9' : 'transparent',
            color: showSharePanel ? '#1e293b' : '#64748b',
            cursor: 'pointer', fontSize: 13, fontWeight: showSharePanel ? 600 : 400,
            transition: 'all 0.1s', fontFamily: 'inherit',
          }}
            onMouseEnter={e => { if (!showSharePanel) e.currentTarget.style.background = '#f1f5f9' }}
            onMouseLeave={e => { if (!showSharePanel) e.currentTarget.style.background = 'transparent' }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
            </svg>
            <span className="sd-btn-label">Share</span>
          </button>}

          {/* Delete lives last, past Share, and always behind a modal, because
              it is the one destructive action in this bar. It is a SOFT delete -
              the row is stamped deleted_at and kept in trash, so a mistake is
              recoverable. Ownership is decided in App: the handler is only
              passed down when you can actually edit, so there is one gate,
              not two. */}
          {onDeleteDiagram && (
            <button className="sd-hide-mobile" onClick={() => setConfirmDelete(true)} title="Delete this diagram" style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '0 10px', height: 30, borderRadius: 8, border: 'none',
              background: 'transparent', color: '#dc2626',
              cursor: 'pointer', fontSize: 13, fontWeight: 400,
              transition: 'all 0.1s', fontFamily: 'inherit', flexShrink: 0,
            }}
              onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
              </svg>
              <span className="sd-btn-label">Delete</span>
            </button>
          )}


        </div>
      </header>

      {/* Body - code panel + canvas */}
      <div style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>

        {/* Code panel (left, slide-in) */}
        {canEdit && showDetailCode && (
          <div className="sd-code-panel" style={{
            width: 340, flexShrink: 0, background: '#ffffff', borderRight: '1px solid #e4e6e8',
            display: 'flex', flexDirection: 'column', animation: 'sd-slide-left 0.2s ease-out',
          }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #e4e6e8', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#1c1e21" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
              </svg>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#1c1e21', flex: 1 }}>{activeDiagram?.title || 'diagram.json'}</span>
              <button
                onClick={() => {
                  const code = JSON.stringify(activeDiagram?.data || diagramData, null, 2)
                  navigator.clipboard.writeText(code).then(() => {
                    setDetailCodeCopied(true)
                    setTimeout(() => setDetailCodeCopied(false), 2000)
                  }).catch(() => showToastMsg('Copy failed'))
                }}
                style={{ background: detailCodeCopied ? '#22c55e' : '#f4f5f7', border: '1px solid #e4e6e8', borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 600, color: detailCodeCopied ? '#fff' : '#65676b', cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0 }}
              >{detailCodeCopied ? 'Copied!' : 'Copy'}</button>
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              <pre style={{
                margin: 0, padding: '14px 16px', fontSize: 11, lineHeight: 1.75, color: '#1c1e21',
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace", whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>{JSON.stringify(activeDiagram?.data || diagramData, null, 2)}</pre>
            </div>
          </div>
        )}

        {/* Canvas */}
        <div style={{ flex: 1, position: 'relative', background: '#ffffff' }}>
          <NoteEditContext.Provider value={onNoteChange || null}>
          <ReactFlow
            className={`${showSteps ? 'sd-steps-on ' : ''}sd-badge-${badgeMode}`}
            nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onNodeDragStop={onNodeDragStop}
            /* Cmd/Ctrl is reserved for snap-align while dragging, so additive
               multi-select moves to Shift (box-select already uses Shift). */
            multiSelectionKeyCode="Shift"
            onInit={inst => { rfInstanceRef.current = inst; setTimeout(() => { inst.fitView({ padding: 0.15 }); setFitted(true) }, 0) }}
            /* event is null when react-flow moves the viewport itself (fitView),
               and set when a finger or wheel did it - only the latter un-fits. */
            onMove={(event) => { if (event) setFitted(false) }}
            onMoveEnd={(_, viewport) => flashZoomHud(viewport.zoom)}
            fitView fitViewOptions={{ padding: 0.15 }}
            nodesDraggable={canEdit} nodesConnectable={false} elementsSelectable={canEdit}
            panOnDrag zoomOnScroll minZoom={0.2} maxZoom={2.5}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant="dots" gap={24} size={1} color="#e6e8eb" />
            <SnapGuides guides={snapGuides} />
          </ReactFlow>
          </NoteEditContext.Provider>

          {/* Info card overlay - what it tests + goal, pinned top-left of the canvas.
              Tap it to fold it into a badge so the diagram gets the whole screen. */}
          {(activeDiagram?.pattern || activeDiagram?.description) && (infoOpen ? (
            <div className="sd-info-card" role="button" tabIndex={0}
              aria-expanded="true" aria-label="Hide the diagram summary"
              onClick={() => setInfoOpen(false)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setInfoOpen(false) } }}
              style={{
                position: 'absolute', top: 16, left: 16, maxWidth: 340, zIndex: 40,
                background: '#ffffff', color: '#1a2129', borderRadius: 0,
                padding: '14px 16px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
                border: '1px solid #e4e6e8', cursor: 'pointer',
              }}>
              {activeDiagram?.pattern && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b7280', marginBottom: 3 }}>What it tests</div>
                  <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.45, color: '#1a1a1a' }}>{activeDiagram.pattern}</div>
                </div>
              )}
              {activeDiagram?.description && (
                <div>
                  <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b7280', marginBottom: 3 }}>Goal</div>
                  <div style={{ fontSize: 12, lineHeight: 1.5, color: '#444' }}>{activeDiagram.description}</div>
                </div>
              )}
              {/* Chevron, so it reads as foldable before anyone taps it. */}
              <span className="sd-info-fold" aria-hidden="true" style={{
                position: 'absolute', top: 8, right: 8, width: 18, height: 18, borderRadius: 5,
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9aa0a6',
              }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
              </span>
            </div>
          ) : (
            <button type="button" className="sd-info-badge"
              aria-expanded="false" aria-label="Show the diagram summary"
              title="Show the diagram summary"
              onClick={() => setInfoOpen(true)}
              style={{
                position: 'absolute', top: 16, left: 16, zIndex: 40,
                width: 34, height: 34, borderRadius: '50%', padding: 0,
                background: '#ffffff', border: '1px solid #e4e6e8', color: '#4b5563',
                boxShadow: '0 2px 10px rgba(0,0,0,0.10)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
            </button>
          ))}

          {/* Zoom HUD */}
          <div ref={zoomHudRef} style={{
            position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(10,10,15,0.72)', backdropFilter: 'blur(12px)',
            color: '#fff', borderRadius: 100, padding: '7px 20px',
            fontSize: 15, fontWeight: 700, letterSpacing: '0.02em',
            opacity: 0, transition: 'opacity 0.2s ease', pointerEvents: 'none',
            zIndex: 50, boxShadow: '0 2px 16px rgba(0,0,0,0.3)',
          }} />

        </div>

        {/* Details panel (right side): goal + step-by-step walkthrough */}
        {showDetailsPanel && (
          <div className="sd-details-panel" style={{
            width: 320, flexShrink: 0, background: '#ffffff', borderLeft: '1px solid #e2e8f0',
            display: 'flex', flexDirection: 'column', overflowY: 'auto',
            animation: 'sd-slide-right 0.2s ease-out',
          }}>
            <div style={{ padding: '18px 18px 6px' }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#1a2129' }}>{activeDiagram?.title || 'Diagram'}</div>
            </div>

            {/* Pattern - the one-line "what this really tests" (fan-out, idempotency, ...) */}
            {activeDiagram?.pattern && (
              <div style={{ padding: '4px 18px 6px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', marginBottom: 6 }}>What it tests</div>
                <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.5, color: '#1a1a1a' }}>
                  {activeDiagram.pattern}
                </div>
              </div>
            )}

            {/* Goal */}
            <div style={{ padding: '10px 18px 16px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', marginBottom: 6 }}>Goal</div>
              <div style={{ fontSize: 13, lineHeight: 1.6, color: '#444' }}>
                {activeDiagram?.description || 'No description yet for this diagram.'}
              </div>
            </div>

            {/* Steps */}
            {steps.length > 0 && (
              <div style={{ padding: '0 18px 24px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', marginBottom: 10 }}>Steps ({steps.length})</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {steps.map(s => (
                    <div key={s.n} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: 999, background: '#1c1e21', color: '#fff', fontSize: 11, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{s.n}</span>
                      <div style={{ fontSize: 12.5, lineHeight: 1.5, color: '#334155' }}>
                        <span style={{ fontWeight: 700, color: '#1a2129' }}>{s.from} &rarr; {s.to}</span>
                        {s.label && <span style={{ color: '#64748b' }}>{`  -  ${s.label}`}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Share panel (right side) */}
        {canEdit && showSharePanel && (
          <div className="sd-share-panel" style={{
            width: 240, flexShrink: 0, background: '#f1f5f9', borderLeft: '1px solid #e2e8f0',
            display: 'flex', flexDirection: 'column', padding: '20px 16px',
            animation: 'sd-slide-right 0.2s ease-out',
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', marginBottom: 16 }}>Export & Share</div>

            {/* Sneak peek: the exact 1200x630 card Slack, iMessage and X will
                render for this link. Shown only for a saved design with a slug -
                an unsaved or pasted diagram has no public URL to preview. */}
            {shareSlug && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', marginBottom: 6 }}>Link preview</div>
                <img
                  /* Keyed on visibility: the card the browser fetched while the
                     design was private is the generic one, and it must reload the
                     instant the design is published. */
                  src={`/api/og?name=${encodeURIComponent(shareSlug)}&v=${isDiagramPublic ? 'public' : 'private'}`}
                  alt="Share card preview"
                  width={208} height={109}
                  style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff' }}
                  onError={e => { e.currentTarget.style.display = 'none' }}
                />
                <div style={{ fontSize: 10, color: '#6b7280', marginTop: 6, wordBreak: 'break-all', lineHeight: 1.4 }}>{shareUrl}</div>
              </div>
            )}

            {/* Download grid - exact diagrams app colors */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
              <button onClick={exportPng}
                style={{ background: '#FF6188', color: '#221F22', cursor: 'pointer', padding: '7px 0', fontSize: 11, fontWeight: 600, borderRadius: 12, border: 'none', transition: 'all 0.1s', fontFamily: 'inherit' }}
                onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.1)')}
                onMouseLeave={e => (e.currentTarget.style.filter = 'none')}
              >PNG</button>
              <button onClick={exportWebp} title="Same picture as the PNG, about a third of the size"
                style={{ background: '#78DCE8', color: '#221F22', cursor: 'pointer', padding: '7px 0', fontSize: 11, fontWeight: 600, borderRadius: 12, border: 'none', transition: 'all 0.1s', fontFamily: 'inherit' }}
                onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.1)')}
                onMouseLeave={e => (e.currentTarget.style.filter = 'none')}
              >WebP</button>
              <button onClick={exportGif} title="Animated - records the flowing dots, autoplays in Slack and GitHub"
                style={{ background: '#AB9DF2', color: '#221F22', cursor: 'pointer', padding: '7px 0', fontSize: 11, fontWeight: 600, borderRadius: 12, border: 'none', transition: 'all 0.1s', fontFamily: 'inherit' }}
                onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.1)')}
                onMouseLeave={e => (e.currentTarget.style.filter = 'none')}
              >GIF</button>
              <button onClick={exportCode}
                style={{ background: '#FC9867', color: '#221F22', cursor: 'pointer', padding: '7px 0', fontSize: 11, fontWeight: 600, borderRadius: 12, border: 'none', transition: 'all 0.1s', fontFamily: 'inherit' }}
                onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.1)')}
                onMouseLeave={e => (e.currentTarget.style.filter = 'none')}
              >Code</button>
              <button onClick={copyLink}
                style={{ background: copiedLink ? '#A9DC76' : '#FFD866', color: '#221F22', cursor: 'pointer', padding: '7px 0', fontSize: 11, fontWeight: 600, borderRadius: 12, border: 'none', transition: 'all 0.1s', fontFamily: 'inherit' }}
                onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.1)')}
                onMouseLeave={e => (e.currentTarget.style.filter = 'none')}
              >{copiedLink ? 'Copied!' : 'Link'}</button>
              <button onClick={exportJson}
                style={{ background: '#A9DC76', color: '#221F22', cursor: 'pointer', padding: '7px 0', fontSize: 11, fontWeight: 600, borderRadius: 12, border: 'none', transition: 'all 0.1s', fontFamily: 'inherit' }}
                onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.1)')}
                onMouseLeave={e => (e.currentTarget.style.filter = 'none')}
              >JSON</button>
              <button onClick={shareAction}
                style={{ background: copiedShare ? '#A9DC76' : '#78DCE8', color: '#221F22', cursor: 'pointer', padding: '7px 0', fontSize: 11, fontWeight: 600, borderRadius: 12, border: 'none', transition: 'all 0.1s', fontFamily: 'inherit' }}
                onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.1)')}
                onMouseLeave={e => (e.currentTarget.style.filter = 'none')}
              >{copiedShare ? 'Shared!' : 'Share'}</button>
              <button onClick={copyCode}
                style={{ background: copiedCode ? '#A9DC76' : '#AB9DF2', color: '#221F22', cursor: 'pointer', padding: '7px 0', fontSize: 11, fontWeight: 600, borderRadius: 12, border: 'none', transition: 'all 0.1s', fontFamily: 'inherit' }}
                onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.1)')}
                onMouseLeave={e => (e.currentTarget.style.filter = 'none')}
              >{copiedCode ? 'Copied!' : 'Copy'}</button>
            </div>
          </div>
        )}
      </div>

      {/* Public footer - only on a demoed (public) diagram, never owner views */}
      {/* Delete confirmation. Delete is a SOFT delete now - the row is stamped
          deleted_at and sits in trash - so the modal says it is recoverable
          rather than final. It still names the diagram before removing it. */}
      {/* Screen takes damage. A red vignette pulses in from the edges the moment
          delete is armed, so the danger is felt before the wording is read -
          the same trick a shooter uses when you are about to go down. Sits
          under the dialog, over everything else, and never takes a click. */}
      {confirmDelete && <div className="sd-danger" aria-hidden="true" />}

      {confirmDelete && (
        <div onClick={() => setConfirmDelete(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.28)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200,
        }}>
          <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="sd-del-title" style={{
            background: '#ffffff', borderRadius: 16, padding: '26px 28px 22px', width: 440,
            boxShadow: '0 32px 80px rgba(0,0,0,0.20), 0 0 0 1px rgba(0,0,0,0.06)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 12 }}>
              <span style={{ width: 34, height: 34, borderRadius: 10, background: '#fef2f2', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                </svg>
              </span>
              <h2 id="sd-del-title" style={{ fontSize: 15, fontWeight: 700, color: '#1c1e21', margin: 0 }}>Delete this diagram?</h2>
            </div>
            <p style={{ fontSize: 13, color: '#65676b', lineHeight: 1.6, margin: '0 0 20px' }}>
              <b style={{ color: '#1c1e21' }}>{activeDiagram?.title || 'This diagram'}</b> will be moved to trash.
              It disappears from the gallery and from any shared link, but it is kept and can be restored.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmDelete(false)} style={{ padding: '9px 18px', border: '1px solid #e4e6e8', borderRadius: 10, background: '#f4f5f7', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', color: '#65676b', fontWeight: 600 }}>Cancel</button>
              <button onClick={() => { setConfirmDelete(false); onDeleteDiagram() }} autoFocus style={{ padding: '9px 20px', border: 'none', borderRadius: 10, background: '#dc2626', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {isPublic && <Footer />}

      {/* Import Formats modal (shared) */}
      <ImportFormatsModal
        open={showDocs}
        onClose={() => setShowDocs(false)}
        copiedLabel={copiedLabel}
        onCopy={onCopyFormat}
      />

      <style>{`
        /* Touch devices fire mouseenter on tap but NEVER mouseleave, so every
           inline hover background in this toolbar stuck ON after one tap - Fit
           looked permanently active on an iPad. Where there is no real hover,
           ignore the inline background entirely and let the genuinely-toggled
           buttons say so with .is-on. */
        @media (hover: none) {
          .sd-detail-header button { background: transparent !important; }
          .sd-detail-header button.is-on { background: #f1f5f9 !important; }
        }
        /* Layout save indicator next to the title. */
        @keyframes sd-save-rot { to { transform: rotate(360deg); } }
        .sd-save-spin { animation: sd-save-rot 0.7s linear infinite; }
        @keyframes sd-save-pop { 0% { transform: scale(0); opacity: 0; } 60% { transform: scale(1.15); } 100% { transform: scale(1); opacity: 1; } }
        .sd-save-check { animation: sd-save-pop 0.28s ease-out; }
        /* Start/End connector arrow: same thickness + marching flow as edges. */
        @keyframes sd-marker-dash { to { stroke-dashoffset: -18; } }
        .sd-marker-line { stroke-dasharray: 5 4; animation: sd-marker-dash 0.5s linear infinite; }
        /* Phone: shrink the info card so it doesn't swallow the canvas, and cap
           its height with an internal scroll. */
        @media (max-width: 640px) {
          .sd-info-card { top: 10px !important; left: 10px !important; right: 10px !important; max-width: none !important; padding: 10px 12px !important; max-height: 34vh !important; overflow-y: auto !important; }
          .sd-info-badge { top: 10px !important; left: 10px !important; }
        }
        /* Edge label badge - shared layout; per-edge gradient comes from
           --c1/--c2 set inline. Appearance switches by wrapper mode class. */
        .sd-edge-badge {
          position: absolute; display: flex; align-items: center; gap: 4px;
          padding: 3px 8px; border-radius: 999px;
          font-size: 8.5px; font-weight: 700; line-height: 1.35;
          letter-spacing: 0.01em; white-space: nowrap; pointer-events: none;
        }
        /* Only the owner's badges take pointer events - a read-only viewer must
           not be able to grab one, and leaving them inert keeps clicks falling
           through to the canvas as before. */
        .sd-edge-badge.is-movable { pointer-events: auto; cursor: grab; }
        .sd-edge-badge.is-movable:hover { filter: brightness(1.08); }
        .sd-edge-badge.is-dragging { cursor: grabbing; z-index: 20; filter: brightness(1.12); }
        /* 1) Silver fill + gradient border, dark text (default) */
        .sd-badge-silver .sd-edge-badge {
          color: #1e2733; border: 1.5px solid transparent;
          background:
            linear-gradient(#e9ebee, #e9ebee) padding-box,
            linear-gradient(90deg, var(--c1), var(--c2)) border-box;
        }
        /* 2) Colorized gradient fill, white text */
        .sd-badge-color .sd-edge-badge {
          color: #fff; border: none; text-shadow: 0 1px 2px rgba(0,0,0,0.5);
          background: linear-gradient(90deg, var(--c1), var(--c2));
        }
        /* 3) Dark badge, white text */
        .sd-badge-dark .sd-edge-badge {
          color: #fff; border: none; background: #1c1e21;
        }
        /* 4) Plain silver, black text */
        .sd-badge-plain .sd-edge-badge {
          color: #1e2733; border: 1.5px solid #c2c6cc; background: #e9ebee;
        }
        /* Phone: the toolbar must fit without scrolling sideways. Labels drop to
           icons, and the 4 actions with a gesture equivalent (Code, Fit,
           Arrange, Details) drop out entirely - pinch and drag already cover
           fit and pan, and the panels are reachable once the canvas is open. */
        @media (max-width: 640px) {
          .sd-detail-header {
            /* Scroll rather than hide: on a very small phone the owner's bar is
               wider than the screen, and hiding the overflow put a real button
               out of reach with no sign it was there. */
            overflow-x: auto !important;
            padding: 0 8px !important;
            gap: 2px !important;
          }
          .sd-detail-header .sd-btn-label { display: none; }
          .sd-detail-header .sd-hide-mobile { display: none !important; }
          /* 2 earn their place back on a phone: Fit is the only way home after
             pinching around, and Arrange is the owner's one-tap tidy. Delete
             gives up its seat for them - a destructive tap is the last thing a
             crowded phone bar needs, and it is still there on a desktop.
             The visibility pill drops to its icon: the green globe and the amber
             lock still say which it is, and the label is in its aria-label. */
          .sd-detail-header .sd-hide-mobile.sd-show-mobile { display: flex !important; }
          .sd-detail-header .sd-vis-label { display: none; }
          .sd-detail-header .sd-visibility { padding: 0 8px !important; }
        }
        /* Small phones (SE and friends): the owner's bar is 1 button wider than
           the room, and the header hides its overflow, so tighten rather than
           silently clip something off the right edge. */
        @media (max-width: 400px) {
          .sd-detail-header { padding: 0 6px !important; gap: 0 !important; }
          .sd-detail-header button { padding: 0 6px !important; min-width: 34px !important; }
          .sd-detail-header .sd-divider-phone { margin: 0 2px !important; }
          /* Dividers separate groups that no longer exist once the labels and
             the 4 desktop-only actions are gone - left in, they stack into a
             row of stray bars. */
          .sd-detail-header .sd-divider { display: none; }
          .sd-detail-header .sd-divider-phone { display: block; height: 22px !important; margin: 0 4px !important; }
          /* Phone targets, 25% up from the desktop sizes so they land under an
             index finger: the Back tile and the brand tile go 36 -> 45, and the
             toolbar actions 30 -> 38 inside their pill. With only 4 marks in the
             bar there is room, and the header is 54px so 45 still clears it. */
          .sd-detail-header button { padding: 0 10px !important; height: 38px !important; min-width: 38px !important; }
          .sd-detail-header > button[aria-label="Back to gallery"] { width: 45px !important; height: 45px !important; }
          .sd-detail-header .sd-brand-tile { width: 45px !important; height: 45px !important; }
          .sd-detail-header .sd-brand-tile img { width: 20px !important; height: 20px !important; }
          .sd-detail-header .sd-visibility { height: 32px !important; }
          /* The title has to yield, not push the buttons off-screen. */
          .sd-detail-title {
            min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            font-size: 13px !important;
          }
        }

        /* Delete is armed: pulse the canvas red from the edges in. */
        @keyframes sd-danger-pulse {
          0%, 100% { opacity: 0.5; }
          50%      { opacity: 1; }
        }
        .sd-danger {
          position: fixed; inset: 0; pointer-events: none; z-index: 1150;
          box-shadow: inset 0 0 150px 45px rgba(220, 38, 38, 0.55),
                      inset 0 0 40px 6px rgba(185, 28, 28, 0.35);
          animation: sd-danger-pulse 1.05s ease-in-out infinite;
        }
        /* Anyone who asked for less motion still gets the red, just steady. */
        @media (prefers-reduced-motion: reduce) {
          .sd-danger { animation: none; opacity: 0.75; }
        }
        /* "+ note" ghost on a card with no note: owner only, shown on hover. */
        .sd-note-add { opacity: 0; transition: opacity 0.12s; }
        .react-flow__node:hover .sd-note-add, .react-flow__node.selected .sd-note-add { opacity: 1; }
        /* Step number, first thing in the badge - hidden until Steps is on. */
        .sd-step-chip { display: none; }
        .sd-steps-on .sd-step-chip {
          display: inline-flex; align-items: center; justify-content: center;
          /* Deliberately smaller than the badge's text line, so the circle sits
             INSIDE the pill with clearance top and bottom instead of pressing
             against the border. */
          min-width: 12px; height: 12px; padding: 0 2.5px; border-radius: 999px;
          font-size: 8px; font-weight: 800; line-height: 1;
          background: #1c1e21; color: #fff; flex-shrink: 0;
        }
        /* On a dark badge a dark chip would vanish - flip it. */
        .sd-badge-dark .sd-step-chip, .sd-badge-color .sd-step-chip {
          background: #fff; color: #1c1e21;
        }
        /* On phones the fixed-width side panels would crush the canvas, so drop
           them to full-width bottom sheets over the canvas instead. */
        @media (max-width: 640px) {
          .sd-code-panel, .sd-share-panel, .sd-details-panel {
            position: absolute !important; left: 0 !important; right: 0 !important;
            bottom: 0 !important; top: auto !important; width: 100% !important;
            max-height: 60vh; z-index: 20; border: none !important;
            box-shadow: 0 -10px 30px rgba(0,0,0,0.18);
          }
        }
      `}</style>
    </div>
  )
}
