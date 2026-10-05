import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { isPlaying, setPlaying, subscribePlaying, isFlowing, subscribeFlowing } from '../flowClock'
import { ReactFlow, Background } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import diagramData from '../data/diagram.json'
import ImportFormatsModal from '../components/ImportFormatsModal'
import { nodeTypes } from '../components/AwsNode'
import { NoteEditContext, InfoEditContext, NodeResizeContext, IconResizeContext, ShowNotesContext } from '../components/noteEditContext'
import { edgeTypes } from '../components/GradientEdge'
import { Toast } from '../components/Toast'
import { SnapGuides } from '../components/SnapGuides'
import { Footer } from '../components/Footer'
import { brandFor } from '../brands'
import { FormatPanel } from '../components/FormatPanel.jsx'
import { findService } from '../services.js'
import { SUNSET, INK } from '../sunset.js'
import { CodeBlock } from '../components/CodeBlock.jsx'
import { PanelResizer } from '../components/PanelResizer.jsx'


// History row time: fresh saves read as "4 min ago"; once the wall clock has
// rolled past midnight the day is worth naming again, so "yesterday 14:02".
function versionTime(iso) {
  const d = new Date(iso)
  const now = new Date()
  const minutes = Math.floor((now.getTime() - d.getTime()) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hhmm = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  if (d.toDateString() === now.toDateString()) return `${Math.floor(minutes / 60)} hr ago`
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return `yesterday ${hhmm}`
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${hhmm}`
}

// One tile in the floating action pill, lit while whatever it opens is open.
// The owner's bar writes these by hand; the visitor's bar is built from this so
// a reading control looks and behaves the same for whoever is looking at it.
function BarButton({ on, label, title, onClick, children }) {
  return (
    <button className={on ? 'is-on' : ''} onClick={onClick} title={title} style={{
      display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
      padding: '0 10px', height: 30, borderRadius: 8, border: 'none',
      background: on ? '#f1f5f9' : 'transparent', color: on ? '#1e293b' : '#64748b',
      cursor: 'pointer', fontSize: 13, fontWeight: on ? 600 : 400,
      transition: 'all 0.1s', fontFamily: 'inherit',
    }}
      onMouseEnter={e => { if (!on) e.currentTarget.style.background = '#f1f5f9' }}
      onMouseLeave={e => { if (!on) e.currentTarget.style.background = 'transparent' }}
    >
      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{children}</svg>
      <span className="sd-btn-label">{label}</span>
    </button>
  )
}

// ─── Detail (canvas) view ───────────────────────────────────────────────────

export function DetailView({
  toast,
  onBack,
  showDetailCode, setShowDetailCode,
  rfInstance: rfInstanceRef, flashZoomHud, zoomHudRef,
  showSharePanel, setShowSharePanel,
  showDetailsPanel, setShowDetailsPanel,
  // Owner only: undefined for anyone else, same as onSetLocks below - one
  // gate, not two.
  showHistoryPanel, setShowHistoryPanel, onRestored,
  steps = [],
  showSteps, setShowSteps,
  showNotes, setShowNotes,
  badgeMode, setBadgeMode,
  activeDiagram,
  detailCodeCopied, setDetailCodeCopied,
  nodes, edges, onNodesChange, onEdgesChange, onNodeDragStop, snapGuides = [],
  exportPng, exportWebp, exportGif, exportCode, exportJson, copyLink, copiedLink, shareAction, copiedShare, copyCode, copiedCode,
  shareSlug, shareUrl,
  showDocs, setShowDocs, copiedLabel, onCopyFormat,
  onEdgeStyleChange,
  showToastMsg,
  isPublic,
  saveState = 'idle',
  onArrange,
  canUndo, canRedo, onUndo, onRedo,
  onDeleteDiagram,
  // Two locks, both on for every flow until the owner lifts one. The delete
  // lock keeps Delete inert; the edit lock keeps agents from rewriting it.
  // onSetLocks({ locked } | { edit_locked }) flips one.
  isLocked, isEditLocked, onSetLocks,
  // (nodeId, note) => void when the owner is signed in; undefined otherwise,
  // which makes every node note read-only (shared links, /demo).
  onNoteChange,
  onInfoChange,
  // (nodeId, { w, h }) => void when the owner is signed in; undefined
  // otherwise, which makes every node card a fixed, non-resizable size.
  onNodeResize,
  // (nodeId, iconSize | null) => void when the owner is signed in; undefined
  // otherwise. Resizes the icon/photo INSIDE the card, independent of the card.
  onIconResize,
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
  const [codeWidth, setCodeWidth] = useState(340)
  const brand = brandFor(activeDiagram?.title)
  // React Flow already carries selection on the node object, so the format
  // panel needs no state of its own - and cannot drift out of step with the
  // canvas. One card at a time: styling a multi-select would have to answer
  // what the panel shows when two cards disagree, and the answer is a feature
  // of its own.
  const selectedNode = nodes.length ? nodes.filter(n => n.selected).length === 1 && nodes.find(n => n.selected) : null
  // A card wins over a line: clicking a card can leave the line it sits on
  // selected too, and the thing under the pointer is the thing being styled.
  const selectedEdge = selectedNode ? null
    : edges.length ? edges.filter(e => e.selected).length === 1 && edges.find(e => e.selected) : null
  // A hand bend beats a picked arrow type in the renderer, so while a line is
  // bent NO arrow type is in effect. Lighting one would be the panel reporting
  // something the canvas is not doing - and it would also swallow the click
  // that is supposed to replace the bend.
  const edgeStyleShown = !selectedEdge ? null : !selectedEdge.data?.bend ? selectedEdge.data?.style
    : Object.fromEntries(Object.entries(selectedEdge.data.style || {}).filter(([k]) => k !== 'arrow'))
  // The colour the thing ALREADY is, so the panel's 2 colour rows can show it.
  // A card's brand colour is never one of the 5 swatches, and a line's default
  // is not a colour at all but the from/to gradient.
  const colorOf = (id) => {
    const n = nodes.find(x => x.id === id)
    return n?.data?.sunset ? SUNSET.border : (findService(n?.data || {})?.color || INK)
  }
  const [confirmDelete, setConfirmDelete] = useState(false)
  // The Arrange button opens a small style menu instead of arranging directly.
  // Open menu holds the screen spot under the button. It is fixed, not absolute:
  // the header scrolls sideways, so anything absolute inside it is clipped at
  // the header's bottom edge and the canvas takes the click instead.
  const [arrangeMenu, setArrangeMenu] = useState(null)
  const arrangeRef = useRef(null)
  useEffect(() => {
    if (!arrangeMenu) return
    const onPointerDown = e => { if (arrangeRef.current && !arrangeRef.current.contains(e.target)) setArrangeMenu(null) }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [arrangeMenu])
  // The Lock button opens the same kind of menu, one row per lock.
  const [lockMenu, setLockMenu] = useState(null)
  const lockRef = useRef(null)
  useEffect(() => {
    if (!lockMenu) return
    const onPointerDown = e => { if (lockRef.current && !lockRef.current.contains(e.target)) setLockMenu(null) }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [lockMenu])
  // The summary card sits over the canvas and covers part of the diagram, so
  // it starts folded to a small badge in the corner on every screen; a click
  // opens it when the reader wants the framing.
  const [infoOpen, setInfoOpen] = useState(false)
  // Fit is an ACTION, but it reads as a state on touch (the inline hover
  // background never clears without a mouseleave). So make the state real:
  // lit only while the canvas actually IS the fitted view, cleared the moment
  // you pan or zoom away from it.
  const [fitted, setFitted] = useState(true)
  // Mirrored from flowClock so the button reflects the real state even when
  // something else stops the dots. Still by default - a diagram is usually being
  // read, not watched.
  const [playing, setPlayingState] = useState(isPlaying)
  useEffect(() => subscribePlaying(setPlayingState), [])
  // What the canvas draws: solid still lines while paused, dashes and dots
  // while playing or while a GIF capture is stepping the dots (see flowClock).
  const [flowing, setFlowing] = useState(isFlowing)
  useEffect(() => subscribeFlowing(setFlowing), [])

  // The title outranks the button labels. When the name would have to
  // truncate to fit the labelled bar, the bar drops to icons instead; the
  // labels come back once the header is wide enough for both again. The
  // width that needs is remembered at the moment of collapse (the width it
  // had plus the part of the title that was cut off), so this settles in one
  // pass rather than flapping. A title change forgets it and measures afresh.
  const headerRef = useRef(null)
  const [iconsOnly, setIconsOnly] = useState(false)
  const labelsFitAt = useRef(0)
  const measuredTitle = useRef(null)
  const titleText = activeDiagram?.title || ''
  useLayoutEffect(() => {
    const header = headerRef.current
    if (!header || typeof ResizeObserver === 'undefined') return
    if (measuredTitle.current !== titleText) { measuredTitle.current = titleText; labelsFitAt.current = 0 }
    const check = () => {
      const title = header.querySelector('.sd-detail-title')
      if (!title) return
      const width = header.clientWidth
      const cut = title.scrollWidth - title.clientWidth
      if (!iconsOnly && cut > 0) { labelsFitAt.current = width + cut + 8; setIconsOnly(true) }
      else if (iconsOnly && width >= labelsFitAt.current) setIconsOnly(false)
    }
    check()
    const ro = new ResizeObserver(check)
    ro.observe(header)
    return () => ro.disconnect()
  }, [iconsOnly, titleText])
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
  }, [showDetailsPanel, showSteps, showSharePanel, showDetailCode, showHistoryPanel])

  // Push to Miro. Miro has no file import for diagrams at all, so this is the
  // one export that is a request rather than a download: the owner pastes a
  // token from their own Miro app settings and a board URL. The token lives in
  // this state for the length of the push and is never stored anywhere.
  const [miro, setMiro] = useState(null)
  async function pushMiro() {
    if (!activeDiagram?.id || !miro) return
    setMiro(m => ({ ...m, busy: true, msg: '' }))
    try {
      const r = await fetch(`/api/flows/${activeDiagram.id}/miro`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: miro.token, board: miro.board }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setMiro(m => ({ ...m, busy: false, msg: j.error || 'Miro said no' })); return }
      window.open(j.boardUrl, '_blank', 'noopener')
      setMiro(null)
    } catch { setMiro(m => ({ ...m, busy: false, msg: 'Could not reach the server' })) }
  }

  // History panel: fetch the list on open, and again after every restore - a
  // restore is itself versioned, so the fresh top row is always what just ran.
  const [versions, setVersions] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState(null)
  const [restoringId, setRestoringId] = useState(null)
  const [restoreError, setRestoreError] = useState(null)
  function loadVersions() {
    if (!activeDiagram?.id) return
    setHistoryLoading(true)
    setHistoryError(null)
    fetch(`/api/flows/${activeDiagram.id}/versions`, { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(data => setVersions(data.versions || []))
      .catch(() => setHistoryError('Could not load history'))
      .finally(() => setHistoryLoading(false))
  }
  useEffect(() => {
    if (!showHistoryPanel) return
    setRestoreError(null)
    loadVersions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHistoryPanel])

  function handleRestore(v) {
    if (restoringId || !activeDiagram?.id) return
    if (!window.confirm(`Restore the version from ${versionTime(v.saved_at)}? The current diagram is kept in history.`)) return
    setRestoringId(v.id)
    setRestoreError(null)
    fetch(`/api/flows/${activeDiagram.id}/versions/${v.id}/restore`, { method: 'POST', credentials: 'include' })
      .then(async r => {
        const body = await r.json().catch(() => ({}))
        if (r.status === 409) { setRestoreError(body.detail || body.error || 'This diagram is locked'); return }
        if (!r.ok) { setRestoreError('Could not restore that version'); return }
        onRestored?.()
        loadVersions()
      })
      .catch(() => setRestoreError('Could not restore that version'))
      .finally(() => setRestoringId(null))
  }
  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}>
      <Toast message={toast.message} visible={toast.visible} />

      {/* Header - diagrams-style floating pill toolbar. Scrolls horizontally on
          narrow screens so every action stays reachable instead of clipping. */}
      {/* A visitor gets the slim bar Sequences and Mindmaps put over a shared
          diagram - the wordmark home - and the reading half of the owner's
          toolbar with it: the dots played or paused, the steps and notes on or
          off, and the pictures of the diagram under Share. Nothing here changes
          the diagram; everything that does (Arrange, Fit, Undo, History, Lock,
          Delete) is still the owner's alone, and so is the code panel. Without
          these a shared link is a picture the reader cannot turn the animation
          off on. */}
      {!canEdit ? (
      <header className="sd-share-header" style={{
        height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        padding: '0 20px', paddingTop: 'env(safe-area-inset-top)', boxSizing: 'content-box', flexShrink: 0,
        background: '#ffffff', borderBottom: '1px solid #e5e7eb',
        overflowX: 'auto', overflowY: 'hidden', WebkitOverflowScrolling: 'touch',
      }}>
        <a href="/demo" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', flexShrink: 0 }}>
          <img src="/icon-96.png" alt="Flows" width={28} height={28} style={{ borderRadius: 7 }} />
          <span className="sd-hide-mobile" style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em', color: '#111827' }}>Flows</span>
        </a>

        <div className="sd-detail-actions" style={{
          display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0,
          background: '#ffffff', border: '1px solid #e4e6e8', borderRadius: 14,
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '4px 6px',
        }}>
          <BarButton on={playing} label={playing ? 'Pause' : 'Play'} title={playing ? 'Stop the flowing dots' : 'Play the flowing dots'} onClick={() => setPlaying(!playing)}>
            {playing ? <><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></>
                     : <path d="M7 4.5v15l12-7.5z"/>}
          </BarButton>
          <div className="sd-divider" style={{ width: 1, height: 18, background: '#e4e6e8', flexShrink: 0, margin: '0 2px' }} />
          <BarButton on={showSteps} label="Steps" title={showSteps ? 'Hide the step numbers' : 'Number every step'} onClick={() => setShowSteps(v => !v)}>
            <line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/>
            <path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>
          </BarButton>
          <BarButton on={showNotes} label="Notes" title={showNotes ? 'Hide the note under each node' : 'Show the note under each node'} onClick={() => setShowNotes(v => !v)}>
            <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>
            <line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>
          </BarButton>
          <div className="sd-divider" style={{ width: 1, height: 18, background: '#e4e6e8', flexShrink: 0, margin: '0 2px' }} />
          <BarButton on={showSharePanel} label="Share" title="Download a picture of this diagram, or copy the link" onClick={() => setShowSharePanel(v => !v)}>
            <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
          </BarButton>
        </div>

        {/* Nothing follows the pill: it sits against the right edge, the way
            the owner's own toolbar ends. Download PNG was a second door to the
            one the Share panel already opens, and a Sign in button only asks a
            reader with no account for something they cannot give. */}
      </header>
      ) : (
      <header ref={headerRef} className={`sd-detail-header${iconsOnly ? ' sd-icons-only' : ''}`} style={{
        height: 54, background: 'linear-gradient(180deg, #fbfbfc 0%, #eef0f3 100%)', borderBottom: '1px solid #e4e7ea',
        display: 'flex', alignItems: 'center', padding: '0 16px', paddingTop: 'env(safe-area-inset-top)', boxSizing: 'content-box', gap: 10, flexShrink: 0,
        overflowX: 'auto', overflowY: 'hidden', WebkitOverflowScrolling: 'touch',
      }}>
        {/* Back button */}
        <button onClick={() => { onBack(); setShowDetailCode(false); }}
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
        {/* Owner only. A visitor gets the diagram the way the owner left it - the
            same panels, the same badge style, playing on its own - and nothing
            to change it with, the same plain share view Sequences and Mindmaps
            give. */}
        {canEdit && (
        <div className="sd-detail-actions" style={{
          display: 'flex', alignItems: 'center', gap: 2,
          background: '#ffffff', border: '1px solid #e4e6e8', borderRadius: 14,
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '4px 6px',
        }}>
          {/* Code toggle */}
          {canEdit && <button className="sd-hide-mobile sd-hide-tablet" onClick={() => setShowDetailCode(v => !v)} style={{
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

          {/* Only the owner has Code to the left of this. */}
          {canEdit && <div className="sd-divider sd-hide-tablet" style={{ width: 1, height: 18, background: '#e4e6e8', flexShrink: 0, margin: '0 2px' }} />}

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

          <button className="sd-hide-mobile sd-show-mobile" onClick={() => setPlaying(!playing)}
            title={playing ? 'Stop the flowing dots' : 'Play the flowing dots'} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '0 10px', height: 30, borderRadius: 8, border: 'none',
            background: playing ? '#f1f5f9' : 'transparent', color: playing ? '#1e293b' : '#64748b',
            cursor: 'pointer', fontSize: 13, fontWeight: playing ? 600 : 400,
            transition: 'all 0.1s', fontFamily: 'inherit',
          }}
            onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')}
            onMouseLeave={e => (e.currentTarget.style.background = playing ? '#f1f5f9' : 'transparent')}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              {playing ? <><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></>
                       : <path d="M7 4.5v15l12-7.5z"/>}
            </svg>
            <span className="sd-btn-label">{playing ? 'Pause' : 'Play'}</span>
          </button>

          {/* Arrange and undo are the owner's; a visitor has no group here to fence. */}
          {canEdit && <div className="sd-divider sd-hide-tablet" style={{ width: 1, height: 18, background: '#e4e6e8', flexShrink: 0, margin: '0 2px' }} />}

          {/* Auto-arrange: a small menu picks the style, then re-lay-out and fit */}
          {canEdit && <div ref={arrangeRef} style={{ position: 'relative' }}>
            <button className="sd-hide-mobile sd-show-mobile sd-hide-tablet" onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setArrangeMenu(m => m ? null : { top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 226)) }) }} title="Arrange the layout" style={{
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
            </button>
            {arrangeMenu && <div role="menu" style={{ position: 'fixed', top: arrangeMenu.top, left: arrangeMenu.left, zIndex: 1000, minWidth: 210, padding: 4, background: '#fff', border: '1px solid #e4e6e8', borderRadius: 10, boxShadow: '0 8px 24px rgba(15,23,42,0.12)' }}>
              {[['fan', 'Fan out', 'Branches spread to the right'], ['rows', 'Rows', 'Tight, left to right']].map(([style, name, sub]) => (
                <button key={style} role="menuitem" onClick={() => { onArrange && onArrange(style); setArrangeMenu(null) }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', border: 'none', borderRadius: 7, background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{name}</div>
                  <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 1 }}>{sub}</div>
                </button>
              ))}
            </div>}
          </div>}


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
          <button className={`sd-hide-mobile sd-hide-tablet${showDetailsPanel ? ' is-on' : ''}`} onClick={() => setShowDetailsPanel(v => !v)} style={{
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

          {/* History panel toggle - owner only: onRestored is only ever passed
              for the owner's own session (see App), same single gate the
              Lock and Delete buttons below already use. */}
          {onRestored && (
            <button className={`sd-hide-mobile sd-hide-tablet${showHistoryPanel ? ' is-on' : ''}`} onClick={() => setShowHistoryPanel(v => !v)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '0 10px', height: 30, borderRadius: 8, border: 'none',
              background: showHistoryPanel ? '#f1f5f9' : 'transparent',
              color: showHistoryPanel ? '#1e293b' : '#64748b',
              cursor: 'pointer', fontSize: 13, fontWeight: showHistoryPanel ? 600 : 400,
              transition: 'all 0.1s', fontFamily: 'inherit',
            }}
              onMouseEnter={e => { if (!showHistoryPanel) e.currentTarget.style.background = '#f1f5f9' }}
              onMouseLeave={e => { if (!showHistoryPanel) e.currentTarget.style.background = 'transparent' }}
            >
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 16 14"/>
              </svg>
              <span className="sd-btn-label">History</span>
            </button>
          )}

          <div className="sd-divider sd-hide-tablet" style={{ width: 1, height: 18, background: '#e4e6e8', flexShrink: 0, margin: '0 2px' }} />

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

          {/* Notes toggle - a caption under every box is a wall of text when you only
              want the shape of the diagram. */}
          <button className={showNotes ? "is-on" : ""} onClick={() => setShowNotes(v => !v)}
            title={showNotes ? 'Hide the note under each node' : 'Show the note under each node'} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '0 10px', height: 30, borderRadius: 8, border: 'none',
            background: showNotes ? '#f1f5f9' : 'transparent',
            color: showNotes ? '#1e293b' : '#64748b',
            cursor: 'pointer', fontSize: 13, fontWeight: showNotes ? 600 : 400,
            transition: 'all 0.1s', fontFamily: 'inherit',
          }}
            onMouseEnter={e => { if (!showNotes) e.currentTarget.style.background = '#f1f5f9' }}
            onMouseLeave={e => { if (!showNotes) e.currentTarget.style.background = 'transparent' }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>
              <line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>
            </svg>
            <span className="sd-btn-label">Notes</span>
          </button>

          {/* Kept on a phone: Steps and the badge style are the 2 actions left in
              the bar there, and without a line between them they read as 1 control. */}
          <div className="sd-divider sd-divider-phone sd-hide-tablet" style={{ width: 1, height: 18, background: '#e4e6e8', flexShrink: 0, margin: '0 2px' }} />

          {/* Badge style cycle: silver -> color -> dark -> plain */}
          <button className="sd-hide-tablet" onClick={() => {
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
          {/* Lock. Both locks are off on a new flow. The delete lock keeps
              Delete inert until it is turned off - a second, deliberate action.
              The edit lock keeps agents (MCP, the API) from rewriting the flow;
              the owner's own edits here never answer to it. The button shows
              the tighter state and opens a menu with one switch per lock. */}
          {onSetLocks && <div ref={lockRef} className="sd-hide-mobile" style={{ position: 'relative', flexShrink: 0 }}>
            <button aria-haspopup="menu" aria-expanded={!!lockMenu}
              onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setLockMenu(lockMenu ? null : { top: r.bottom + 6, left: r.left }) }}
              title={isLocked || isEditLocked ? 'Locked - open to see which lock is on and lift one' : 'Both locks are off - open to lock delete or edits'} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '0 10px', height: 30, borderRadius: 8, border: 'none',
              background: isLocked || isEditLocked ? '#fef3c7' : 'transparent',
              color: isLocked || isEditLocked ? '#92400e' : '#64748b',
              cursor: 'pointer', fontSize: 13, fontWeight: isLocked || isEditLocked ? 600 : 400,
              transition: 'all 0.1s', fontFamily: 'inherit', flexShrink: 0,
            }}
              onMouseEnter={e => { if (!(isLocked || isEditLocked)) e.currentTarget.style.background = '#f1f5f9' }}
              onMouseLeave={e => { if (!(isLocked || isEditLocked)) e.currentTarget.style.background = 'transparent' }}
            >
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                {isLocked || isEditLocked ? <path d="M7 11V7a5 5 0 0 1 10 0v4" /> : <path d="M7 11V7a5 5 0 0 1 9.9-1" />}
              </svg>
              <span className="sd-btn-label">{isLocked || isEditLocked ? 'Locked' : 'Lock'}</span>
            </button>
            {lockMenu && <div role="menu" style={{ position: 'fixed', top: lockMenu.top, left: lockMenu.left, zIndex: 1000, minWidth: 250, padding: 4, background: '#fff', border: '1px solid #e4e6e8', borderRadius: 10, boxShadow: '0 8px 24px rgba(15,23,42,0.12)' }}>
              {[
                ['locked', 'Delete lock', isLocked, isLocked ? 'On - nobody can delete it, you included, until this is off' : 'Off - you can delete it; agents still cannot'],
                ['edit_locked', 'Edit lock', isEditLocked, isEditLocked ? 'On - agents cannot change it; your own edits here still work' : 'Off - agents (MCP, API) can change it'],
              ].map(([key, name, on, sub]) => (
                <button key={key} role="menuitemcheckbox" aria-checked={on} onClick={() => onSetLocks({ [key]: !on })} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '7px 10px', border: 'none', borderRadius: 7, background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <span aria-hidden="true" style={{ width: 30, height: 18, borderRadius: 9, flexShrink: 0, background: on ? '#b45309' : '#cbd5e1', position: 'relative', transition: 'background 0.15s' }}>
                    <span style={{ position: 'absolute', top: 2, left: on ? 14 : 2, width: 14, height: 14, borderRadius: 7, background: '#fff', transition: 'left 0.15s' }} />
                  </span>
                  <span>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{name}</div>
                    <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 1 }}>{sub}</div>
                  </span>
                </button>
              ))}
            </div>}
          </div>}

          {onDeleteDiagram && (
            <button className="sd-hide-mobile" onClick={() => !isLocked && setConfirmDelete(true)} disabled={isLocked}
              title={isLocked ? 'Delete locked - lift the delete lock under Lock first' : 'Delete this diagram'} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '0 10px', height: 30, borderRadius: 8, border: 'none',
              background: 'transparent', color: isLocked ? '#cbd5e1' : '#dc2626',
              cursor: isLocked ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 400,
              transition: 'all 0.1s', fontFamily: 'inherit', flexShrink: 0,
            }}
              onMouseEnter={e => { if (!isLocked) e.currentTarget.style.background = '#fef2f2' }}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
              </svg>
              <span className="sd-btn-label">Delete</span>
            </button>
          )}


        </div>)}
      </header>
      )}

      {/* Body - code panel + canvas */}
      <div style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>

        {/* Code panel (left, slide-in) */}
        {canEdit && showDetailCode && (
          <div className="sd-code-panel" style={{
            width: codeWidth, flexShrink: 0, background: '#ffffff', borderRight: '1px solid #e4e6e8', position: 'relative',
            display: 'flex', flexDirection: 'column', animation: 'sd-slide-left 0.2s ease-out',
          }}>
            <PanelResizer width={codeWidth} onWidth={setCodeWidth} />
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
              <CodeBlock data={activeDiagram?.data || diagramData} fontSize={9} padding="14px 16px" />
            </div>
          </div>
        )}

        {/* Canvas */}
        <div style={{ flex: 1, position: 'relative', background: '#ffffff' }}>
          <ShowNotesContext.Provider value={showNotes}>
          <NoteEditContext.Provider value={onNoteChange || null}>
          <InfoEditContext.Provider value={onInfoChange || null}>
          <NodeResizeContext.Provider value={onNodeResize || null}>
          <IconResizeContext.Provider value={onIconResize || null}>
          <ReactFlow
            className={`${showSteps ? 'sd-steps-on ' : ''}${flowing ? '' : 'sd-still '}${canEdit ? '' : 'sd-reading '}sd-badge-${badgeMode}`}
            nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            onNodeDragStop={onNodeDragStop}
            /* Cmd/Ctrl is reserved for snap-align while dragging, so additive
               multi-select moves to Shift (box-select already uses Shift). */
            multiSelectionKeyCode="Shift"
            /* Delete as well as Backspace, because Delete is the key people
               reach for and React Flow only listens for Backspace by default.
               A visitor gets neither. */
            deleteKeyCode={canEdit ? ['Backspace', 'Delete'] : null}
            /* It removes a LINE and only a line. A card dropped here would go
               from the canvas but not from the row, and be back on reload. */
            onBeforeDelete={({ edges: dying }) => Promise.resolve({ nodes: [], edges: dying })}
            onInit={inst => { rfInstanceRef.current = inst; setTimeout(() => { inst.fitView({ padding: 0.15 }); setFitted(true) }, 0) }}
            /* event is null when react-flow moves the viewport itself (fitView),
               and set when a finger or wheel did it - only the latter un-fits. */
            onMove={(event) => { if (event) setFitted(false) }}
            onMoveEnd={(_, viewport) => flashZoomHud(viewport.zoom)}
            fitView fitViewOptions={{ padding: 0.15 }}
            /* A reader selects: clicking a card lights every line in and out of
               it, which is how you follow a path on someone else's diagram.
               Nothing moves - the drag handles on a line only exist when the
               owner's onEndMove/onBendMove are threaded into its data. */
            nodesDraggable={canEdit} nodesConnectable={false} elementsSelectable
            /* 2 fingers on the trackpad pan the canvas in any direction, the way
               Sequences and Mindmaps do; pinch or Cmd + wheel zooms. */
            panOnDrag panOnScroll panOnScrollMode="free" panOnScrollSpeed={1} zoomOnScroll={false} minZoom={0.2} maxZoom={2.5}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant="dots" gap={24} size={1} color="#e6e8eb" />
            <SnapGuides guides={snapGuides} />
          </ReactFlow>
          </IconResizeContext.Provider>
          </NodeResizeContext.Provider>
          </InfoEditContext.Provider>
          </NoteEditContext.Provider>
          </ShowNotesContext.Provider>

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

        {/* History panel (right side): every saved version, newest first */}
        {showHistoryPanel && (
          <div className="sd-history-panel" style={{
            width: 320, flexShrink: 0, background: '#ffffff', borderLeft: '1px solid #e2e8f0',
            display: 'flex', flexDirection: 'column', overflowY: 'auto',
            animation: 'sd-slide-right 0.2s ease-out',
          }}>
            <div style={{ padding: '18px 18px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#1a2129' }}>History</div>
              <button onClick={() => setShowHistoryPanel(false)} aria-label="Close" style={{ background: 'none', border: 'none', color: '#8a8d91', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
            </div>

            {historyLoading && (
              <div style={{ padding: '4px 18px 16px', fontSize: 13, color: '#6b7280' }}>Loading...</div>
            )}

            {!historyLoading && historyError && (
              <div style={{ padding: '4px 18px 16px', fontSize: 13, color: '#dc2626' }}>{historyError}</div>
            )}

            {!historyLoading && !historyError && versions.length === 0 && (
              <div style={{ padding: '4px 18px 16px', fontSize: 13, color: '#6b7280', lineHeight: 1.6 }}>
                No versions yet. Every change from here on is kept.
              </div>
            )}

            {!historyLoading && !historyError && restoreError && (
              <div style={{ padding: '0 18px 12px', fontSize: 12, color: '#dc2626', lineHeight: 1.5 }}>{restoreError}</div>
            )}

            {!historyLoading && versions.map(v => {
              const isLayout = v.kind === 'layout'
              const showTitle = v.title && v.title !== activeDiagram?.title
              return (
                <div key={v.id} style={{ padding: '12px 18px', borderTop: '1px solid #f1f5f9' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#1a2129' }}>{versionTime(v.saved_at)}</span>
                    <span style={{
                      fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                      padding: '2px 8px', borderRadius: 999,
                      background: isLayout ? '#f1f5f9' : '#eff6ff',
                      color: isLayout ? '#475569' : '#2563eb',
                      border: `1px solid ${isLayout ? '#e2e8f0' : '#bfdbfe'}`,
                    }}>{isLayout ? 'Layout' : 'Content'}</span>
                    {/* Restore sits on the time line, pushed to the right, so a
                        row is 2 lines and the list shows twice as many versions. */}
                    <button
                      onClick={() => handleRestore(v)}
                      disabled={!!restoringId}
                      style={{
                        marginLeft: 'auto', padding: '4px 12px', border: '1px solid #e4e6e8', borderRadius: 8,
                        background: restoringId === v.id ? '#f4f5f7' : '#ffffff', cursor: restoringId ? 'not-allowed' : 'pointer',
                        fontSize: 12, fontWeight: 600, fontFamily: 'inherit', color: '#1a2129',
                      }}
                    >{restoringId === v.id ? 'Restoring...' : 'Restore'}</button>
                  </div>
                  {showTitle && <div style={{ fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 2 }}>{v.title}</div>}
                  {v.reason && <div style={{ fontSize: 11.5, color: '#6b7280', marginBottom: 6, lineHeight: 1.4 }}>{`Before: ${v.reason}`}</div>}
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{`${v.node_count} node${v.node_count === 1 ? '' : 's'}, ${v.edge_count} edge${v.edge_count === 1 ? '' : 's'}`}</div>
                </div>
              )
            })}
          </div>
        )}

        {/* Format panel (right side), for a selected LINE only. A clicked card
            lights its lines instead of opening a panel (owner rule 2026-10-04);
            a stored card style still renders, it is just not edited here. */}
        {canEdit && onEdgeStyleChange && selectedEdge && (
          <FormatPanel
            target="edge"
            value={edgeStyleShown}
            stroke={`linear-gradient(90deg, ${colorOf(selectedEdge.source)}, ${colorOf(selectedEdge.target)})`}
            onChange={(style) => onEdgeStyleChange(selectedEdge.id, style)}
            onReset={() => onEdgeStyleChange(selectedEdge.id, null)}
          />
        )}

        {/* Share panel (right side) */}
        {showSharePanel && (
          <div className="sd-share-panel" style={{
            width: 240, flexShrink: 0, background: '#f1f5f9', borderLeft: '1px solid #e2e8f0',
            display: 'flex', flexDirection: 'column', padding: '20px 16px',
            animation: 'sd-slide-right 0.2s ease-out',
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', marginBottom: 16 }}>Export & Share</div>

            {/* Sneak peek: the exact 1200x630 card Slack, iMessage and X will
                render for this link. Shown only for a saved design with a slug -
                an unsaved or pasted diagram has no public URL to preview. */}
            {canEdit && shareSlug && (
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
              {canEdit && <button onClick={copyLink}
                style={{ background: copiedLink ? '#A9DC76' : '#FFD866', color: '#221F22', cursor: 'pointer', padding: '7px 0', fontSize: 11, fontWeight: 600, borderRadius: 12, border: 'none', transition: 'all 0.1s', fontFamily: 'inherit' }}
                onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.1)')}
                onMouseLeave={e => (e.currentTarget.style.filter = 'none')}
              >{copiedLink ? 'Copied!' : 'Link'}</button>}
              {canEdit && <button onClick={exportJson}
                style={{ background: '#A9DC76', color: '#221F22', cursor: 'pointer', padding: '7px 0', fontSize: 11, fontWeight: 600, borderRadius: 12, border: 'none', transition: 'all 0.1s', fontFamily: 'inherit' }}
                onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.1)')}
                onMouseLeave={e => (e.currentTarget.style.filter = 'none')}
              >JSON</button>}
              {canEdit && <button onClick={shareAction}
                style={{ background: copiedShare ? '#A9DC76' : '#78DCE8', color: '#221F22', cursor: 'pointer', padding: '7px 0', fontSize: 11, fontWeight: 600, borderRadius: 12, border: 'none', transition: 'all 0.1s', fontFamily: 'inherit' }}
                onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.1)')}
                onMouseLeave={e => (e.currentTarget.style.filter = 'none')}
              >{copiedShare ? 'Shared!' : 'Share'}</button>}
              {canEdit && <button onClick={copyCode}
                style={{ background: copiedCode ? '#A9DC76' : '#AB9DF2', color: '#221F22', cursor: 'pointer', padding: '7px 0', fontSize: 11, fontWeight: 600, borderRadius: 12, border: 'none', transition: 'all 0.1s', fontFamily: 'inherit' }}
                onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.1)')}
                onMouseLeave={e => (e.currentTarget.style.filter = 'none')}
              >{copiedCode ? 'Copied!' : 'Copy'}</button>}
              {/* The exports above are pictures of the diagram. This one is the
                  diagram: real shapes and bound arrows with the logos embedded,
                  so it can be opened and kept working on in Excalidraw. Plain
                  link, not a blob - the owner's session cookie rides along on a
                  same-origin navigation and the server does the rendering. */}
              {canEdit && activeDiagram?.id && (
                <a href={`/api/flows/${activeDiagram.id}?format=excalidraw`} download
                  title="An editable .excalidraw scene - every card a real shape with its logo, every edge a bound arrow"
                  style={{ background: '#FF6188', color: '#221F22', cursor: 'pointer', padding: '7px 0', fontSize: 11, fontWeight: 600, borderRadius: 12, border: 'none', transition: 'all 0.1s', fontFamily: 'inherit', textAlign: 'center', textDecoration: 'none' }}
                  onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.1)')}
                  onMouseLeave={e => (e.currentTarget.style.filter = 'none')}
                >Excalidraw</a>
              )}
              {/* One file, four tools: Lucidchart File > Import takes a draw.io
                  file on any account, and so do draw.io, Confluence and VS Code.
                  Lucid's own .lucid format would need an OAuth'd import API. */}
              {canEdit && activeDiagram?.id && (
                <a href={`/api/flows/${activeDiagram.id}?format=drawio`} download
                  title="A .drawio file - import into Lucidchart (File > Import), or open in draw.io, Confluence or VS Code"
                  style={{ background: '#FC9867', color: '#221F22', cursor: 'pointer', padding: '7px 0', fontSize: 11, fontWeight: 600, borderRadius: 12, border: 'none', transition: 'all 0.1s', fontFamily: 'inherit', textAlign: 'center', textDecoration: 'none' }}
                  onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.1)')}
                  onMouseLeave={e => (e.currentTarget.style.filter = 'none')}
                >Lucid / draw.io</a>
              )}
              {canEdit && activeDiagram?.id && (
                <button onClick={() => setMiro(m => (m ? null : { token: '', board: '', busy: false, msg: '' }))}
                  title="Push this flow onto a Miro board - real shapes, real connectors, logos included"
                  style={{ background: '#78DCE8', color: '#221F22', cursor: 'pointer', padding: '7px 0', fontSize: 11, fontWeight: 600, borderRadius: 12, border: 'none', transition: 'all 0.1s', fontFamily: 'inherit' }}
                  onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.1)')}
                  onMouseLeave={e => (e.currentTarget.style.filter = 'none')}
                >Miro</button>
              )}
            </div>
            {/* Miro asks for a token because it has no other way in: its REST
                API is the only import path and every Miro token comes out of an
                OAuth flow. Pasting one beats running a redirect route and
                holding someone's credentials - this one is sent with the push
                and kept nowhere. */}
            {miro && (
              <div style={{ marginTop: 8, padding: 10, borderRadius: 10, background: '#2D2A2E', display: 'grid', gap: 6 }}>
                <input value={miro.token} onChange={e => setMiro(m => ({ ...m, token: e.target.value }))}
                  type="password" placeholder="Miro OAuth token" autoComplete="off" spellCheck={false}
                  style={{ padding: '6px 8px', fontSize: 11, borderRadius: 8, border: '1px solid #5B595C', background: '#221F22', color: '#FCFCFA', fontFamily: 'inherit' }} />
                <input value={miro.board} onChange={e => setMiro(m => ({ ...m, board: e.target.value }))}
                  placeholder="https://miro.com/app/board/..." autoComplete="off" spellCheck={false}
                  style={{ padding: '6px 8px', fontSize: 11, borderRadius: 8, border: '1px solid #5B595C', background: '#221F22', color: '#FCFCFA', fontFamily: 'inherit' }} />
                <button onClick={pushMiro} disabled={miro.busy || !miro.token || !miro.board}
                  style={{ background: '#78DCE8', color: '#221F22', cursor: miro.busy ? 'wait' : 'pointer', padding: '7px 0', fontSize: 11, fontWeight: 600, borderRadius: 12, border: 'none', opacity: miro.busy || !miro.token || !miro.board ? 0.5 : 1, fontFamily: 'inherit' }}
                >{miro.busy ? 'Pushing...' : 'Push to board'}</button>
                <div style={{ fontSize: 10, color: miro.msg ? '#FF6188' : '#939293', lineHeight: 1.4 }}>
                  {miro.msg || <>Miro app settings &gt; <b>Install app and get OAuth token</b>. Never stored.</>}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* The social footer belongs to the showcase alone: a diagram opened from
          /demo. A shared link or a signed-out owner is reading someone's work,
          not browsing a portfolio, and a footer there is an advert. */}
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
        /* The title outranks the labels (see iconsOnly). */
        .sd-detail-header.sd-icons-only .sd-btn-label { display: none; }
        /* Paused: a plain solid line and no dot, the diagram is being read.
           Playing (or a capture stepping the frames): the dash marches and
           the dot travels. */
        .react-flow.sd-still .react-flow__edge.animated .react-flow__edge-path { stroke-dasharray: none !important; animation: none !important; }
        .react-flow.sd-still .sd-flow-dot { display: none; }
        /* The Start pill's connector is an edge too: solid and still with the rest. */
        .react-flow.sd-still .sd-marker-line { stroke-dasharray: none !important; animation: none !important; }
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
        /* A tag with a description shows the whole of it on hover, in the
           app only: the SVG has no hover. The tag takes pointer events so
           the hover lands; a visitor's other tags stay inert as before. */
        .sd-edge-badge[data-tip] { pointer-events: auto; }
        .sd-edge-badge[data-tip]::after {
          content: attr(data-tip); position: absolute; left: 50%; bottom: calc(100% + 8px);
          transform: translateX(-50%); width: max-content; max-width: 260px;
          padding: 8px 10px; border-radius: 8px; background: #1c1e21; color: #fff;
          font-size: 12px; font-weight: 400; line-height: 1.4; letter-spacing: 0; text-align: left;
          white-space: normal; text-shadow: none; box-shadow: 0 6px 20px rgba(0,0,0,0.18);
          opacity: 0; visibility: hidden; transition: opacity 0.12s; pointer-events: none; z-index: 30;
        }
        .sd-edge-badge[data-tip]:hover::after { opacity: 1; visibility: visible; }
        /* The tag layer paints under the cards, so a hovered tag climbs over
           every card (a selected card sits at 1000) and its tip is never
           covered by the box next to it. */
        .sd-edge-badge[data-tip]:hover { z-index: 1001; }
        /* A reader moves nothing, so nothing offers the hand that says they can.
           The pointer stays the plain arrow over the canvas and over every card. */
        .sd-reading .react-flow__pane, .sd-reading .react-flow__node,
        .sd-reading .react-flow__pane.draggable, .sd-reading .sd-edge-badge { cursor: default; }
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
          /* The reading pill sits against the right edge, so its overflow all
             falls off that edge: on a phone it drops to icons and fits. */
          .sd-share-header .sd-btn-label { display: none; }
          .sd-share-header { padding: 0 10px !important; }
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
        /* Landscape phone, and a tablet in Split View or Slide Over. The owner's
           full bar measures 1109px, so anything under that scrolled sideways -
           the 1 thing a toolbar must never do. Between the phone tier and that
           width, the 4 actions that have another way in drop out: Code (the
           share panel carries the same markup), Arrange (desktop tidy), Details
           (the info card on the canvas says the same thing) and the badge-style
           cycle. The visibility pill keeps its globe and loses its word. What is
           left - Fit, Play, Steps, Notes, Share, Lock, Delete - fits on 1 row. */
        @media (min-width: 641px) and (max-width: 1120px) {
          .sd-detail-header .sd-hide-tablet { display: none !important; }
          .sd-detail-header .sd-vis-label { display: none; }
          .sd-detail-header .sd-visibility { padding: 0 8px !important; }
        }
        /* Narrower than that - a phone held sideways, or a third of an iPad -
           7 labelled buttons still do not fit, so they drop to their icons, the
           same trade the phone tier already makes. */
        @media (min-width: 641px) and (max-width: 880px) {
          .sd-detail-header .sd-btn-label { display: none; }
        }
        /* Phones held upright, a Pro Max included: even icon-only the owner's
           bar is wider than the room, so tighten rather than silently clip
           something off the right edge. */
        @media (max-width: 480px) {
          .sd-detail-header { padding: 0 6px !important; gap: 0 !important; }
          .sd-detail-header button { padding: 0 6px !important; min-width: 34px !important; }
          .sd-detail-header .sd-divider-phone { margin: 0 2px !important; }
          /* Dividers separate groups that no longer exist once the labels and
             the 4 desktop-only actions are gone - left in, they stack into a
             row of stray bars. */
          .sd-detail-header .sd-divider { display: none; }
          .sd-detail-header .sd-divider-phone { display: block; height: 22px !important; margin: 0 4px !important; }
          /* Even icon-only, the bar ran 79px past an SE. The badge-style cycle
             and Arrange give up their seats: both are tidying, neither is the
             way to read a diagram, and both are back 1 breakpoint up. */
          .sd-detail-header .sd-hide-tablet { display: none !important; }
          .sd-detail-header .sd-show-mobile.sd-hide-tablet { display: none !important; }
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

        /* Narrower than an SE2 (an SE1, or an iPad Slide Over pane): the 2 tiles
           at the start cost 90px between them and only 1 of them does anything.
           The brand logo steps aside - the title next to it already names the
           diagram, and the Back tile still has to be tappable. */
        @media (max-width: 374px) {
          .sd-detail-header .sd-brand-tile { display: none !important; }
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
        /* iOS zooms the whole page when a focused input is under 16px. Only a
           touch device pays that tax - a mouse keeps the note's own 10px, so
           the text does not change size the moment it is clicked. */
        @media (hover: none) and (pointer: coarse) { .sd-note-edit { font-size: 16px; } }
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
          .sd-code-panel, .sd-share-panel, .sd-details-panel, .sd-history-panel {
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
