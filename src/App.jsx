import { useState, useEffect, useCallback, useRef } from 'react'
import * as flowClock from './flowClock'
import { applyNodeChanges } from '@xyflow/react'
import diagramData from './data/diagram.json'
import SignInScreen from './components/SignInScreen'
import { IndexView } from './views/IndexView'
import { DetailView } from './views/DetailView'
import { layoutElements } from './layout'
import { rowToDiagram } from './rowToDiagram'
import { snapAlign } from './snapAlign'
import { findService } from './services'
import { fireflies } from './fireflies'

// Vite exposed import.meta.env.DEV; Next replaces process.env.NODE_ENV at build
// time, so this compiles to a constant in the client bundle exactly the same way.
const IS_DEV = process.env.NODE_ENV !== 'production'

// ─── Default data ─────────────────────────────────────────────────────────────


// The area a diagram has to fit in, so Arrange can size the layout to the real
// canvas instead of guessing. Falls back to the window when the canvas is not
// mounted yet (opening a diagram straight from a /?id= URL).
function canvasSize() {
  const el = typeof document !== 'undefined' && document.querySelector('.react-flow')
  if (el?.clientWidth) return { width: el.clientWidth, height: el.clientHeight }
  return { width: window.innerWidth, height: Math.max(320, window.innerHeight - 54) }
}

// A layout snapshot: just the node positions, which is all Arrange changes.
const positionsOf = nds => nds
  .filter(n => n.type === 'awsNode' && n.position)
  .map(n => ({ id: n.id, position: { ...n.position } }))

// Every edge renders as a gradient (source color -> target color) and is
// animated with marching motion. Node id === service key, so we can look up
// each endpoint's brand color directly.
// onLabelMove is threaded into every edge's data so a badge can be dragged. It is
// omitted for the bundled sample and for a read-only viewer, and the edge renders
// its badge inert in that case.
function buildEdges(rawEdges, onLabelMove, rawNodes) {
  // The edge takes its colour from the SOURCE node, and a node that brings its
  // own logo states its colour only in that logo - so the node itself has to be
  // looked up, not just its id. Passing `{ id }` alone matched generic catalog
  // entries (`browser`, `cli`, `api`) and painted a Chrome edge pink.
  const byId = new Map((rawNodes || []).map(n => [n.id, n]))
  const edgeColor = id => findService(byId.get(id) || { id })?.color || '#6b7280'
  return rawEdges.map((e, i) => ({
    id: e.id || `e${i}`,
    source: e.source,
    target: e.target,
    label: e.label,
    type: 'gradient',
    animated: true,
    data: {
      sourceColor: edgeColor(e.source), targetColor: edgeColor(e.target), step: i + 1,
      ...(typeof e.labelT === 'number' ? { labelT: e.labelT } : {}),
      ...(onLabelMove ? { onLabelMove } : {}),
    },
  }))
}

// Exactly ONE "Start here" pill per diagram - the source of step 1, which is
// robust even for closed loops. There is deliberately no Destination pill: it
// guessed at an endpoint the diagram never claimed, and where a flow BEGINS is
// the only hint a reader actually needs.
const NODE_W = 190, NODE_H = 120 // nominal card size, for the free-space check
const MARKER_GAP = 96            // pill height + connector run

function buildMarkers(nodes, edges) {
  if (!nodes.length) return { nodes: [], edges: [] }
  const byId = id => nodes.find(n => n.id === id)
  const hasIncoming = new Set(edges.map(e => e.target))

  // Start: source of the first edge; else any node with no incoming edge; else node 0.
  let startId = edges[0] && edges[0].source && byId(edges[0].source) ? edges[0].source : null
  if (!startId) startId = (nodes.find(n => !hasIncoming.has(n.id)) || nodes[0]).id

  // The pill must never share a face with an edge - a green arrow landing on the
  // same side as a real connection reads as part of the flow. So work out which
  // faces this node's edges already use and take the first free one, preferring
  // top (a diagram reads downward), then left, then the remaining sides.
  const nodeCenter = n => ({ x: (n.position?.x ?? 0) + NODE_W / 2, y: (n.position?.y ?? 0) + NODE_H / 2 })
  const used = new Set()
  const sc = byId(startId) ? nodeCenter(byId(startId)) : { x: 0, y: 0 }
  for (const e of edges) {
    const otherId = e.source === startId ? e.target : e.target === startId ? e.source : null
    const other = otherId && byId(otherId)
    if (!other) continue
    const oc = nodeCenter(other)
    const dx = oc.x - sc.x, dy = oc.y - sc.y
    used.add(Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'bottom' : 'top'))
  }

  const mNodes = []
  const s = byId(startId)
  if (s) {
    const p = s.position || { x: 0, y: 0 }
    // A side also has to be physically clear - no point pointing the arrow
    // through a neighbouring box.
    const clear = {
      top: !nodes.some(n => n.id !== startId && n.position && Math.abs(n.position.x - p.x) < NODE_W && p.y - n.position.y > 0 && p.y - n.position.y < NODE_H + MARKER_GAP),
      bottom: !nodes.some(n => n.id !== startId && n.position && Math.abs(n.position.x - p.x) < NODE_W && n.position.y - p.y > 0 && n.position.y - p.y < NODE_H + MARKER_GAP),
      left: !nodes.some(n => n.id !== startId && n.position && Math.abs(n.position.y - p.y) < NODE_H && p.x - n.position.x > 0 && p.x - n.position.x < NODE_W + 200),
      right: !nodes.some(n => n.id !== startId && n.position && Math.abs(n.position.y - p.y) < NODE_H && n.position.x - p.x > 0 && n.position.x - p.x < NODE_W + 200),
    }
    const order = ['top', 'left', 'bottom', 'right']
    const side = order.find(k => !used.has(k) && clear[k]) || order.find(k => !used.has(k)) || 'left'
    const place = {
      top: { pos: { x: p.x + 6, y: p.y - MARKER_GAP }, dir: 'down' },
      bottom: { pos: { x: p.x + 6, y: p.y + NODE_H + 40 }, dir: 'up' },
      left: { pos: { x: p.x - 200, y: p.y + 37 }, dir: 'right' },
      right: { pos: { x: p.x + 205, y: p.y + 37 }, dir: 'left' },
    }[side]
    mNodes.push({ id: `__start_${startId}`, type: 'marker', position: place.pos, width: 132, height: 36, data: { kind: 'start', dir: place.dir }, draggable: false, selectable: false })
  }
  return { nodes: mNodes, edges: [] }
}

const defaultEdges = buildEdges(diagramData.edges, undefined, diagramData.nodes)
const defaultNodes = diagramData.nodes.map(n => ({ ...n, type: 'awsNode', data: { id: n.id } }))

// Where a shared link has to point. Sharing from localhost (or a Vercel preview)
// must still hand someone a URL that opens for them, so the origin is pinned to
// prod unless we are already served from a real host. Mirrors the diagrams app.
const PROD_ORIGIN = 'https://flows-bheng.vercel.app'
const publicOrigin = () => {
  if (typeof window === 'undefined') return PROD_ORIGIN
  const { origin, hostname } = window.location
  return hostname === 'localhost' || hostname === '127.0.0.1' ? PROD_ORIGIN : origin
}

// ─── App ──────────────────────────────────────────────────────────────────────

// Sample diagrams for index page (fallback when the API has none saved)
// Shown only when the gallery has nothing real to show. `sample: true` marks it
// as NOT a saved row: it has no database record, so it must never offer a delete
// button - clicking one could only ever fail.
const SEED = [
  { id: 'ifttt', title: 'IFTTT Automation', data: diagramData, updatedAt: new Date().toISOString(), tags: ['AWS', 'Architecture'], sample: true },
]

export default function App() {
  // /demo is a PUBLIC read-only gallery (no sign-in): anyone sees is_public
  // diagrams. The home page ("/") is unchanged - owner-only behind sign-in.
  const isDemo = typeof window !== 'undefined' && window.location.pathname === '/demo'
  const [view, setView] = useState('index') // 'index' | 'detail'
  const [activeDiagram, setActiveDiagram] = useState(null)
  const [nodes, setNodes] = useState(defaultNodes)
  const [edges, setEdges] = useState(defaultEdges)
  const [toast, setToast] = useState({ message: '', visible: false })
  // Declared before the effects/callbacks that depend on it - a const useCallback
  // is not hoisted, so referencing it earlier would be a temporal-dead-zone crash.
  const showToastMsg = useCallback(msg => {
    setToast({ message: msg, visible: true })
    setTimeout(() => setToast(t => ({ ...t, visible: false })), 2500)
  }, [])
  const [search, setSearch] = useState('')
  const [showDocs, setShowDocs] = useState(false)
  const [copiedLabel, setCopiedLabel] = useState(null)
  const [codeDiagram, setCodeDiagram] = useState(null)
  const [codeCopied, setCodeCopied] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [showAIPrompt, setShowAIPrompt] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiThinking, setAiThinking] = useState(false)
  const [showDetailCode, setShowDetailCode] = useState(false)
  const [detailCodeCopied, setDetailCodeCopied] = useState(false)
  const [showSharePanel, setShowSharePanel] = useState(false)
  const [showDetailsPanel, setShowDetailsPanel] = useState(false)
  const [showSteps, setShowSteps] = useState(false)
  // Notes show unless a diagram has been toggled off - see 'notes-off' below.
  const [showNotes, setShowNotes] = useState(true)
  const [badgeMode, setBadgeMode] = useState('dark') // dark | silver | color | plain
  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedShare, setCopiedShare] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)
  const [diagrams, setDiagrams] = useState(isDemo ? [] : SEED)
  // Logged-in home has two tabs (top-right button group): 'mine' = my personal
  // (non-demo) diagrams, 'demos' = the 12 curated public demos so the owner can
  // reopen + re-arrange them and have the layout persist. Public /demo ignores this.
  const [galleryTab, setGalleryTab] = useState('mine') // 'mine' | 'demos'
  // Work vs personal. Twenty diagrams in one list meant hunting for the one that
  // matters; this splits the day job from stock bots and practice designs.
  const [scope, setScope] = useState('all') // 'all' | 'work' | 'personal'
  const [loadingId, setLoadingId] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [listError, setListError] = useState(false) // gallery fetch failed
  const [user, setUser] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  // Panel memory waiting for ownership to settle on a cold deep link (see openDiagram).
  const pendingPanels = useRef(null)
  const [devBypass, setDevBypass] = useState(false)
  const canAI = (Boolean(user) || IS_DEV) && !isDemo
  const rfInstance = useRef(null)
  // Snap-align: yellow guides to draw, plus a live "is Cmd/Ctrl down" flag. The
  // flag is a ref because it is read inside the drag handler on every frame.
  const [snapGuides, setSnapGuides] = useState([])
  const snapModRef = useRef(false)
  // Arrange is the one destructive click on the canvas - it throws away a
  // hand-placed layout. So it offers a way back, but only right after you press
  // it: { before, after, undone }. No permanent undo/redo chrome in the toolbar.
  // Undo/redo for the canvas. A step is just the node positions before an edit -
  // dragging and Arrange are the only things that move anything - so a snapshot
  // is tiny and restoring is exact. `kind` is kept so undoing an Arrange re-fits
  // the view (it zoomed to its own layout) while undoing a drag leaves the
  // viewport alone.
  const [history, setHistory] = useState({ past: [], future: [] })
  const nodesRef = useRef([])
  const edgesRef = useRef([])
  const dragStartRef = useRef(null)
  // historyRef mirrors the stack so undo/redo can read it without being rebuilt
  // (and re-bound to the keyboard) on every step.
  const historyRef = useRef(history)
  useEffect(() => { historyRef.current = history }, [history])
  useEffect(() => {
    const track = e => { snapModRef.current = e.metaKey || e.ctrlKey || e.shiftKey }
    const events = ['keydown', 'keyup', 'pointerdown', 'pointermove']
    events.forEach(t => window.addEventListener(t, track))
    return () => events.forEach(t => window.removeEventListener(t, track))
  }, [])
  const pendingFit = useRef(false)
  const menuRef = useRef(null)
  const aiInputRef = useRef(null)
  const zoomHudRef = useRef(null)
  const zoomHudTimer = useRef(null)
  const lastZoomRef = useRef(null)

  useEffect(() => { if (showAIPrompt) aiInputRef.current?.focus() }, [showAIPrompt])

  // Escape closes whichever dialog overlay is open, from anywhere on the page.
  useEffect(() => {
    if (!showAIPrompt && !showDocs) return
    const onKeyDown = e => {
      if (e.key !== 'Escape') return
      if (showAIPrompt) setShowAIPrompt(false)
      else if (showDocs) setShowDocs(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [showAIPrompt, showDocs])

  const loadDiagrams = useCallback(() => {
    // Showcase view = the public /demo route OR the owner's "Demos" tab -> the 12
    // curated public designs. Otherwise the owner's personal (non-demo) diagrams.
    const showcase = isDemo || galleryTab === 'demos'
    return fetch(showcase ? '/api/flows/public' : '/api/flows')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(rows => {
        const mapped = rows.map(rowToDiagram)
        // Never fall back to the IFTTT SEED sample in a showcase view - only real demos.
        setListError(false)
        setDiagrams(mapped.length ? mapped : (showcase ? [] : SEED))
      })
      .catch(() => {
        // An unreachable API used to look identical to "you have one diagram":
        // it fell through to the sample and the gallery said nothing. Say it.
        setListError(true)
        setDiagrams(showcase ? [] : SEED)
      })
  }, [isDemo, galleryTab])

  useEffect(() => { loadDiagrams() }, [loadDiagrams])

  // Owner sign-in state + one-time feedback from the OAuth redirect (?auth=).
  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => { if (d.authenticated) setUser(d) }).catch(() => {}).finally(() => setAuthChecked(true))
    const p = new URLSearchParams(window.location.search).get('auth')
    if (p === 'denied') showToastMsg('That Google account is not authorized')
    else if (p === 'error') showToastMsg('Sign-in failed, try again')
    if (p) { const u = new URL(window.location.href); u.searchParams.delete('auth'); window.history.replaceState({}, '', u) }
  }, [showToastMsg])

  function signOut() {
    fetch('/api/auth/logout', { method: 'POST' }).then(() => { setUser(null); showToastMsg('Signed out') }).catch(() => showToastMsg('Sign out failed'))
  }

  // A locked diagram refuses to be deleted, server-side. This only flips the
  // flag; the guard that matters lives in the DELETE handler.
  async function toggleLock() {
    if (!activeDiagram?.id) return
    const next = !activeDiagram.locked
    const res = await fetch(`/api/flows/${activeDiagram.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locked: next }),
    })
    if (!res.ok) { showToastMsg('Could not change the lock'); return }
    setActiveDiagram(a => (a ? { ...a, locked: next } : a))
    showToastMsg(next ? 'Locked - it cannot be deleted' : 'Unlocked')
  }

  function deleteDiagram(id, { thenBack = false } = {}) {
    fetch(`/api/flows/${id}`, { method: 'DELETE' }).then(res => {
      if (!res.ok) { showToastMsg('Delete failed'); return }
      // Measure the card (or the open canvas) BEFORE React drops it, then let
      // the fireflies take its place - once it is unmounted there is nothing
      // to measure and the swarm would land in the top-left corner.
      fireflies(thenBack ? document.querySelector('.react-flow') : document.querySelector(`[data-flow-id="${id}"]`))
      // Deleting the diagram you are looking at has to leave the canvas too,
      // or you are staring at something that no longer exists.
      if (thenBack) { setView('index'); setActiveDiagram(null) }
      // Drop the card now so the swarm takes its place, then resync the list.
      setDiagrams(ds => ds.filter(d => d.id !== id))
      showToastMsg('Deleted')
      loadDiagrams()
    }).catch(() => showToastMsg('Delete failed'))
  }

  function copyFormat(label, code) {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedLabel(label)
      setTimeout(() => setCopiedLabel(null), 2000)
    }).catch(() => showToastMsg('Copy failed'))
  }

  async function submitAI() {
    if (!aiPrompt.trim() || aiThinking) return
    setAiThinking(true)
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { showToastMsg(data.error ?? 'Generation failed'); setAiThinking(false); return }
      // data should have { nodes, edges, title }
      const diagram = { id: `ai-${Date.now()}`, title: data.title || 'AI Generated', data: { nodes: data.nodes, edges: data.edges }, updatedAt: new Date().toISOString(), tags: ['AI'] }
      openDiagram(diagram)
      loadDiagrams()
      setShowAIPrompt(false)
      setAiPrompt('')
      setAiThinking(false)
      import('canvas-confetti').then(m => m.default({ particleCount: 120, spread: 80, origin: { y: 0.3 }, zIndex: 9999 }))
      showToastMsg(`Generated "${data.title}" - ${data.nodes.length} nodes`)
    } catch {
      showToastMsg('Network error')
      setAiThinking(false)
    }
  }


  async function renderDiagram(text) {
    try {
      const { parseMermaid } = await import('./parseMermaid')
      const { nodes: n, edges: rawE } = parseMermaid(text)
      if (!n.length) { showToastMsg('Nothing to render - check your syntax'); return null }
      const e = buildEdges(rawE, undefined, n)
      setNodes(n)
      setEdges(e)
      pendingFit.current = true
      showToastMsg(`Rendered ${n.length} nodes · ${e.length} edges`)
      import('canvas-confetti').then(m => m.default({ particleCount: 120, spread: 80, origin: { y: 0.3 }, zIndex: 9999 }))
      return { nodes: n, edges: e }
    } catch {
      showToastMsg('Could not parse diagram')
      return null
    }
  }

  // Slide a step badge along its own edge to somewhere it does not collide.
  // Auto-placement keeps a badge off its own node but cannot see the other
  // badges, so on a dense diagram two can still overlap - this is the manual
  // override. `t` is a 0..1 distance along the edge; null (double-click) puts
  // it back to the computed spot.
  const onLabelMove = useCallback((edgeId, t) => {
    const labelT = typeof t === 'number' ? t : undefined
    setEdges(prev => prev.map(e => (e.id === edgeId
      ? { ...e, data: { ...e.data, labelT } }
      : e)))
    setActiveDiagram(a => {
      if (!a) return a
      const data = { ...a.data, edges: (a.data.edges || []).map((e, i) => ((e.id || `e${i}`) === edgeId
        ? { ...e, labelT }
        : e)) }
      // Saved on DROP, not debounced. A drop is one discrete action, and a debounce
      // meant dragging a badge then immediately navigating threw the move away.
      if (a.id) {
        const payload = data.edges.map((e, i) => ({
          id: e.id || `e${i}`, ...(typeof e.labelT === 'number' ? { labelT: e.labelT } : {}),
        }))
        fetch(`/api/flows/${a.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ edges: payload }),
        }).catch(() => {})
      }
      return { ...a, data }
    })
  }, [])

  // The owner edited a node's note (double-click the caption, or "+ note"). One
  // deliberate edit, saved at once by id - never bundled into a layout save,
  // which a stale tab replays on every drag. '' removes the note.
  const activeId = activeDiagram?.id
  const onNoteChange = useCallback((nodeId, note) => {
    const withNote = nd => { const { note: _old, ...rest } = nd; return note ? { ...rest, note } : rest }
    const patch = nds => (nds || []).map(nd => (nd.id === nodeId ? withNote(nd) : nd))
    setNodes(prev => prev.map(n => (n.id === nodeId ? { ...withNote(n), data: { ...n.data, note } } : n)))
    setActiveDiagram(a => (a ? { ...a, data: { ...a.data, nodes: patch(a.data.nodes) } } : a))
    if (!activeId) return
    setDiagrams(ds => ds.map(d => (d.id !== activeId ? d : { ...d, data: { ...d.data, nodes: patch(d.data.nodes) } })))
    fetch(`/api/flows/${activeId}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: [{ id: nodeId, note }] }),
    })
      .then(r => showToastMsg(r.ok ? (note ? 'Note saved' : 'Note removed') : 'Could not save (owner only)'))
      .catch(() => showToastMsg('Could not save'))
  }, [activeId, showToastMsg])

  // A cold ?name= / ?id= load resolves the design BEFORE /api/auth/me answers, so
  // canAI was still false when the edges were built and no badge came out
  // draggable. Re-attach (or strip) the handler whenever ownership settles.
  useEffect(() => {
    if (view !== 'detail') return
    setEdges(prev => prev.map(e => (
      Boolean(e.data?.onLabelMove) === canAI
        ? e
        : { ...e, data: { ...e.data, onLabelMove: canAI ? onLabelMove : undefined } }
    )))
  }, [canAI, view, onLabelMove])

  function openDiagram(d) {
    setActiveDiagram(d)
    setHistory({ past: [], future: [] })
    // Reopen where you left off: the panel that was open and the badge style
    // you picked travel with the row, so a diagram never resets to a bare
    // canvas. Anything unsaved falls back to the defaults.
    const v = d.view_state || {}
    // `panels` is the set that was open. Rows saved before this shape used a
    // single `panel`, so fold that in rather than dropping their state.
    const open = Array.isArray(v.panels) ? v.panels : v.panel ? [v.panel] : []
    // Panel memory is the OWNER's. Someone opening a shared link gets the
    // diagram and nothing on top of it - the panels open when the owner last
    // looked used to slide out over the canvas on their phone. The share panel
    // is never restored for anyone: opening it is an action (it publishes).
    // A cold ?name= load resolves before /api/auth/me answers, so while
    // ownership is unknown the panels wait and apply once it settles.
    setShowSharePanel(false)
    if (canAI) applyPanels(open)
    else { applyPanels([]); pendingPanels.current = authChecked ? null : open }
    if (['dark', 'silver', 'color', 'plain'].includes(v.badge)) setBadgeMode(v.badge)
    const raw = d.data.nodes || []
    // Use the owner's saved layout when every node has a stored position;
    // otherwise auto-layout with dagre so nothing overlaps.
    const hasSaved = raw.length > 0 && raw.every(nd => nd.position && Number.isFinite(nd.position.x) && Number.isFinite(nd.position.y))
    // Carry any custom brand fields (label/icon/color/sub) into node data so a
    // bring-your-own-icon node renders its own logo, not a catalog lookup.
    const n = raw.map(nd => ({ ...nd, type: 'awsNode', data: { id: nd.id, label: nd.label, icon: nd.icon, color: nd.color, sub: nd.sub, note: nd.note }, ...(hasSaved ? { position: nd.position } : {}) }))
    const e = buildEdges(d.data.edges, canAI ? onLabelMove : undefined, raw)
    setNodes(hasSaved ? n : layoutElements(n, e, { canvas: canvasSize() }))
    setEdges(e)
    setView('detail')
    pendingFit.current = true
    // Readable deep link: /demo?name=<slug>. A diagram with no slug (AI-generated
    // or pasted, so nothing saved yet) leaves the URL alone - there is nothing to
    // link to. ?id= is still honoured on load for older shared links.
    if (d.slug) {
      const url = new URL(window.location.href)
      url.searchParams.delete('id')
      url.searchParams.set('name', d.slug)
      window.history.replaceState({}, '', url)
    }
  }

  function applyPanels(open) {
    setShowSteps(open.includes('steps'))
    setShowDetailsPanel(open.includes('details'))
    setShowDetailCode(open.includes('code'))
    // Inverted: stored when notes are OFF, so a row that predates the toggle
    // (and every row a visitor loads) still shows the notes its author wrote.
    setShowNotes(!open.includes('notes-off'))
  }
  useEffect(() => {
    if (!authChecked) return
    const open = pendingPanels.current
    pendingPanels.current = null
    if (open && canAI && view === 'detail') applyPanels(open)
  }, [authChecked, canAI, view])

  // Persist the canvas layout (owner only) a beat after a drag ends, so a
  // rearranged diagram stays put on reopen instead of resetting to auto-layout.
  // saveState drives the little spinner/check next to the title: idle|saving|saved.
  const saveTimer = useRef(null)
  const savedResetTimer = useRef(null)
  const [saveState, setSaveState] = useState('idle')
  const doSave = useCallback((diagramId, nds, notify = false) => {
    const payload = nds.filter(n => n.type === 'awsNode' && n.position)
      .map(n => ({
        id: n.id,
        position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
        // Preserve bring-your-own-icon fields so saving the layout never strips them.
        ...(n.icon ? { icon: n.icon } : {}),
        ...(n.label ? { label: n.label } : {}),
        ...(n.color ? { color: n.color } : {}),
        ...(n.sub ? { sub: n.sub } : {}),
        ...(n.note ? { note: n.note } : {}),
      }))
    if (!payload.length) return
    setSaveState('saving')
    fetch(`/api/flows/${diagramId}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodes: payload }),
    })
      .then(r => {
        setSaveState(r.ok ? 'saved' : 'idle')
        if (r.ok) {
          // Sync the in-memory gallery copy so reopening the card (without a
          // refetch) shows the saved layout instead of the stale pre-drag one.
          const posById = Object.fromEntries(payload.map(p => [p.id, p.position]))
          setDiagrams(ds => ds.map(d => d.id !== diagramId ? d : {
            ...d,
            data: { ...d.data, nodes: d.data.nodes.map(nd => posById[nd.id] ? { ...nd, position: posById[nd.id] } : nd) },
          }))
        }
        if (notify) showToastMsg(r.ok ? 'Layout saved' : 'Could not save (owner only)')
      })
      .catch(() => { setSaveState('idle'); if (notify) showToastMsg('Could not save') })
      .finally(() => {
        if (savedResetTimer.current) clearTimeout(savedResetTimer.current)
        savedResetTimer.current = setTimeout(() => setSaveState('idle'), 1800)
      })
  }, [showToastMsg])
  const savePositions = useCallback((diagramId, nds) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => doSave(diagramId, nds), 600)
  }, [doSave])

  // Record the layout as it was BEFORE an edit. A new edit clears the redo pile,
  // the same as every editor. 50 steps is far more than anyone walks back.
  const pushHistory = useCallback((positions, kind) => {
    setHistory(h => ({ past: [...h.past, { positions, kind }].slice(-50), future: [] }))
  }, [])

  // Put a snapshot back on the canvas and persist it, so an undo survives reload.
  const applyPositions = useCallback((positions, refit) => {
    const byId = Object.fromEntries(positions.map(p => [p.id, p.position]))
    const next = nodesRef.current.map(n => (byId[n.id] ? { ...n, position: { ...byId[n.id] } } : n))
    setNodes(next)
    if (canAI && activeDiagram?.id) savePositions(activeDiagram.id, next)
    if (refit) setTimeout(() => rfInstance.current?.fitView({ padding: 0.15, duration: 400 }), 60)
  }, [canAI, activeDiagram, savePositions])

  const undo = useCallback(() => {
    const { past, future } = historyRef.current
    if (!past.length) return
    const step = past[past.length - 1]
    setHistory({ past: past.slice(0, -1), future: [...future, { positions: positionsOf(nodesRef.current), kind: step.kind }] })
    applyPositions(step.positions, step.kind === 'arrange')
  }, [applyPositions])

  const redo = useCallback(() => {
    const { past, future } = historyRef.current
    if (!future.length) return
    const step = future[future.length - 1]
    setHistory({ past: [...past, { positions: positionsOf(nodesRef.current), kind: step.kind }], future: future.slice(0, -1) })
    applyPositions(step.positions, step.kind === 'arrange')
  }, [applyPositions])

  // Keyboard shortcuts: Cmd/Ctrl+S saves the current layout immediately (owner,
  // on the detail canvas); Cmd/Ctrl+R re-fetches diagrams in-app (pull-to-refresh)
  // instead of a full browser reload. Both block the browser default.
  useEffect(() => {
    const onKey = e => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && (e.key === 's' || e.key === 'S')) {
        // Always block the browser's "save page as .html" dialog; then save the
        // current layout (with a toast). The backend authorizes owner-only, so a
        // non-owner just gets a "could not save" note.
        e.preventDefault()
        // A visitor still gets the dialog blocked, but there is nothing to save:
        // the showcase canvas is read-only for them.
        if (canAI && view === 'detail' && activeDiagram?.id) {
          if (saveTimer.current) clearTimeout(saveTimer.current)
          doSave(activeDiagram.id, nodesRef.current, true)
        }
      } else if (mod && (e.key === 'z' || e.key === 'Z')) {
        // Cmd/Ctrl+Z undoes, +Shift redoes - but never while typing in the AI
        // prompt, where the browser's own text undo is what you want.
        const t = e.target
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
        e.preventDefault()
        if (canAI && view === 'detail') (e.shiftKey ? redo : undo)()
      } else if (mod && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault()
        if (canAI && view === 'detail') redo()
      } else if (mod && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault()
        loadDiagrams()
        showToastMsg('Refreshed')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [view, canAI, activeDiagram, doSave, loadDiagrams, showToastMsg, undo, redo])

  // Auto-arrange: re-run dagre on the current nodes (start on the left, spread out,
  // steps ordered top-to-bottom, labels clear of nodes), fit-zoom, and persist for
  // the owner so the tidy layout sticks.
  const autoArrange = useCallback(() => {
    const current = nodesRef.current
    const arranged = layoutElements(current.filter(n => n.type === 'awsNode'), edges, { canvas: canvasSize() })
    pushHistory(positionsOf(current), 'arrange')
    setNodes(arranged)
    if (canAI && activeDiagram?.id) savePositions(activeDiagram.id, arranged)
    setTimeout(() => rfInstance.current?.fitView({ padding: 0.15, duration: 400 }), 60)
  }, [edges, canAI, activeDiagram, savePositions, pushHistory])

  // Let nodes be dragged around the canvas (positions live in React state, and
  // are saved to the DB on drag-end when the owner can edit).
  const onNodesChange = useCallback(
    changes => {
      // Cmd/Ctrl held while dragging -> rewrite the drag position so the node
      // latches onto the closest alignment, and show the yellow guide there.
      // Rewriting the CHANGE (not the node afterwards) is what makes the snap
      // stick on release: React Flow's own drag position never lands in state.
      let applied = changes
      const drags = changes.filter(c => c.type === 'position' && c.position)
      const drag = drags[0]
      // Only a single-node drag snaps. Rewriting one position out of a multi-node
      // drag would shear the selection apart.
      if (drag && drags.length === 1 && snapModRef.current) {
        const all = rfInstance.current?.getNodes() ?? []
        const dragged = all.find(n => n.id === drag.id)
        // Only real service nodes are snap targets - the auto Start/Destination
        // pills are decorations whose position is derived, not laid out.
        const targets = all.filter(n => n.type === 'awsNode')
        if (dragged) {
          const { position, guides } = snapAlign({ ...dragged, position: drag.position }, targets)
          applied = changes.map(c => (c === drag ? { ...c, position } : c))
          setSnapGuides(drag.dragging === false ? [] : guides)
        }
      } else if (drag) {
        setSnapGuides(g => (g.length ? [] : g))
      }
      setNodes(nds => {
        const next = applyNodeChanges(applied, nds)
        if (canAI && activeDiagram?.id && applied.some(c => c.type === 'position' && c.dragging === false)) {
          savePositions(activeDiagram.id, next)
        }
        return next
      })
      // One history step per DRAG, not per frame: stash the layout when a drag
      // starts and commit it when the mouse comes up.
      if (drags.some(c => c.dragging) && !dragStartRef.current) {
        dragStartRef.current = positionsOf(nodesRef.current)
      }
      if (applied.some(c => c.type === 'position' && c.dragging === false) && dragStartRef.current) {
        pushHistory(dragStartRef.current, 'drag')
        dragStartRef.current = null
      }
    },
    [canAI, activeDiagram, savePositions, pushHistory],
  )

  // Clear the guides whenever the drag (or the modifier) ends.
  const onNodeDragStop = useCallback(() => setSnapGuides(g => (g.length ? [] : g)), [])

  // nodesRef mirrors the node state so drag/arrange handlers can read the layout
  // without re-creating themselves on every drag frame.
  useEffect(() => { nodesRef.current = nodes }, [nodes])
  useEffect(() => { edgesRef.current = edges }, [edges])

  useEffect(() => {
    if (pendingFit.current && rfInstance.current) {
      setTimeout(() => {
        rfInstance.current.fitView({ padding: 0.15, duration: 400 })
        // Record the fitted zoom as the baseline so the first PAN (same zoom)
        // never flashes the HUD.
        setTimeout(() => { lastZoomRef.current = rfInstance.current?.getZoom?.() ?? null }, 450)
      }, 60)
      pendingFit.current = false
    }
  }, [nodes])


  // Load a saved design when the URL has ?id= (the URL the artifact API returns).
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('id')
    if (!id) return
    setLoadingId(true)
    fetch(`/api/flows/${id}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(d => {
        openDiagram(rowToDiagram(d))
        setLoadingId(false)
      })
      .catch(() => {
        setLoadError(true)
        setLoadingId(false)
      })
    // Same: a one-shot load from the URL, not a subscription to openDiagram.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Open a diagram straight from a readable ?name=<slug> URL (the link the
  // detail view now writes). The owner's list is checked first so a private
  // design resolves, then the public demo roster so a shared /demo?name= link
  // works for a signed-out visitor. A list that 401s or fails just contributes
  // no rows - the other one still gets a chance.
  useEffect(() => {
    const name = new URLSearchParams(window.location.search).get('name')
    if (!name) return
    setLoadingId(true)
    // One direct lookup - the API resolves a slug the same way it resolves a
    // uuid, with the same visibility rule. This used to scan the two list
    // endpoints instead, which silently could not see a PUBLISHED non-demo
    // design: the owner list returns only private rows and the public list only
    // the curated demos, so sharing a diagram broke its own link.
    fetch(`/api/flows/${encodeURIComponent(name)}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(row => {
        openDiagram(rowToDiagram(row))
        setLoadingId(false)
      })
      .catch(() => { setLoadError(true); setLoadingId(false) })
    // Resolves the URL once on mount. openDiagram is stable for that purpose and
    // listing it would re-run the fetch on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Save the open panel + badge style back to the row, debounced, owner only.
  // Only ONE panel is ever open, so this collapses to a single value rather than
  // four booleans - a shape the API can validate.
  const viewSaveTimer = useRef(null)
  const openPanels = [
    showSteps && 'steps', showDetailsPanel && 'details', showDetailCode && 'code',
    !showNotes && 'notes-off',
  ].filter(Boolean)
  const panelKey = openPanels.join(',')
  useEffect(() => {
    if (view !== 'detail' || !canAI || !activeDiagram?.id) return
    const prev = activeDiagram.view_state || {}
    const prevKey = (Array.isArray(prev.panels) ? prev.panels : prev.panel ? [prev.panel] : []).filter(p => p !== 'share').join(',')
    // Cancel first: a state that has come back to what is saved (a deferred
    // restore landing a render later) must not let an older timer save a reset.
    clearTimeout(viewSaveTimer.current)
    if (prevKey === panelKey && prev.badge === badgeMode) return
    const savingId = activeDiagram.id
    viewSaveTimer.current = setTimeout(() => {
      const view_state = { panels: panelKey ? panelKey.split(',') : [], badge: badgeMode }
      fetch(`/api/flows/${savingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ view_state }),
      })
        .then(r => {
          if (!r.ok) return
          setActiveDiagram(a => (a ? { ...a, view_state } : a))
          // The gallery list is fetched once at page load, so its copy of
          // view_state goes stale the moment a panel is toggled. Reopening a
          // diagram from that stale row then RESET the panels - and the reset was
          // saved, destroying the real state. Keep the list in step, the same way
          // a layout save does.
          setDiagrams(ds => ds.map(d => (d.id === savingId ? { ...d, view_state } : d)))
        })
        .catch(() => {})
    }, 600)
    return () => clearTimeout(viewSaveTimer.current)
  }, [view, canAI, activeDiagram, panelKey, badgeMode])

  function backToGallery() {
    setLoadError(false)
    const url = new URL(window.location.href)
    url.searchParams.delete('id')
    url.searchParams.delete('name')
    window.history.replaceState({}, '', url)
    setView('index')
  }

  const onPasteRef = useRef(null)
  onPasteRef.current = async (e) => {
    const active = document.activeElement
    if (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') return
    const text = e.clipboardData?.getData('text') || ''
    if (/graph\s+(LR|TD|RL|BT)/i.test(text)) {
      const parsed = await renderDiagram(text)
      if (!parsed) return
      setView('detail')
      setActiveDiagram({ id: 'pasted', title: 'Pasted Diagram', data: parsed, updatedAt: new Date().toISOString() })
    }
  }

  useEffect(() => {
    const handlePaste = (e) => onPasteRef.current?.(e)
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [])

  useEffect(() => {
    const h = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const filtered = diagrams.filter(d => {
    if (search.trim() && !d.title.toLowerCase().includes(search.toLowerCase())) return false
    // Scope applies to your OWN diagrams only - the demo roster is neither.
    if (scope === 'all' || galleryTab === 'demos' || isDemo) return true
    return (d.tags || []).includes(scope)
  })
  const scopeCounts = {
    all: diagrams.length,
    work: diagrams.filter(d => (d.tags || []).includes('work')).length,
    personal: diagrams.filter(d => (d.tags || []).includes('personal')).length,
  }

  // ── ?id LOADING / ERROR STATES ──────────────────────────────────────────────
  if (loadingId) {
    return (
      <div style={{
        position: 'fixed', inset: 0, background: '#f4f5f7',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}>
        <div style={{
          width: 40, height: 40, border: '3px solid #e4e6e8',
          borderTopColor: '#1c1e21', borderRadius: '50%',
          animation: 'sd-spin 0.8s linear infinite', marginBottom: 16,
        }} />
        <div style={{ fontSize: 14, fontWeight: 600, color: '#1c1e21' }}>Loading design...</div>
        <style>{`@keyframes sd-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (loadError) {
    return (
      <div style={{
        position: 'fixed', inset: 0, background: '#f4f5f7',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: '#e4e6e8', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#8a8d91" strokeWidth={1.5} strokeLinecap="round"><circle cx="12" cy="12" r="9"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>
        </div>
        <p style={{ fontSize: 14, color: '#1c1e21', fontWeight: 600, margin: 0 }}>Design not found</p>
        <p style={{ fontSize: 13, color: '#8a8d91', marginTop: 6, marginBottom: 20 }}>It may have been deleted or the link is invalid</p>
        <button onClick={backToGallery} style={{ padding: '10px 20px', background: '#1c1e21', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>
          Back to gallery
        </button>
      </div>
    )
  }

  // ── SIGN-IN GATE (signed-out home only) ─────────────────────────────────────
  // Shared /?id= diagram views stay public (handled by the detail view); only the
  // home/gallery requires sign-in. While the auth check is in flight, show the
  // animated graph splash so an authed owner never flashes the sign-in card.
  const q = new URLSearchParams(window.location.search)
  const hasIdParam = Boolean(q.get('id') || q.get('name'))
  if (view === 'index' && !hasIdParam && !devBypass && !isDemo) {
    if (!authChecked) return <SignInScreen loading />
    if (!user) return <SignInScreen devBypass={() => setDevBypass(true)} />
  }

  // ── INDEX VIEW ──────────────────────────────────────────────────────────────
  if (view === 'index') {
    return (
      <IndexView
        toast={toast} showToastMsg={showToastMsg}
        search={search} setSearch={setSearch}
        user={user} canAI={canAI} isDemo={isDemo} listError={listError}
        galleryTab={galleryTab} setGalleryTab={setGalleryTab}
        scope={scope} setScope={setScope} scopeCounts={scopeCounts}
        showMenu={showMenu} setShowMenu={setShowMenu} menuRef={menuRef}
        showDocs={showDocs} setShowDocs={setShowDocs}
        copiedLabel={copiedLabel} onCopyFormat={copyFormat}
        filtered={filtered}
        onRefresh={loadDiagrams}
        onOpen={openDiagram}
        onViewCode={setCodeDiagram}
        onDeleteDiagram={deleteDiagram}
        signOut={signOut}
        showAIPrompt={showAIPrompt} setShowAIPrompt={setShowAIPrompt}
        aiPrompt={aiPrompt} setAiPrompt={setAiPrompt}
        aiThinking={aiThinking} aiInputRef={aiInputRef} submitAI={submitAI}
        codeDiagram={codeDiagram} setCodeDiagram={setCodeDiagram}
        codeCopied={codeCopied} setCodeCopied={setCodeCopied}
      />
    )
  }

  // ── Export/Share functions ───────────────────────────────────────────────────

  // The link every share path hands out: the readable ?name= URL on the public
  // origin. A diagram with no slug (unsaved, AI-generated, pasted) has no public
  // URL, so it falls back to whatever is in the address bar.
  const shareSlug = activeDiagram?.slug || ''
  // Always /demo, never "/". Vercel applies rewrites AFTER the filesystem check,
  // and "/" resolves to the static index.html - so the share function never runs
  // there and a link off the home route previews as the generic site card. /demo
  // is not a file, so it reaches the function and gets this design's own card.
  const shareUrl = shareSlug
    ? `${publicOrigin()}/demo?name=${encodeURIComponent(shareSlug)}`
    : (typeof window !== 'undefined' ? window.location.href : PROD_ORIGIN)

  function exportFilename(ext) {
    const t = (activeDiagram?.title || 'diagram').replace(/[^a-z0-9]/gi, '-').toLowerCase()
    const now = new Date()
    return `${t}-${now.toISOString().slice(0, 10)}-${now.toTimeString().slice(0, 5).replace(':', '-')}.${ext}`
  }

  function exportPng() {
    const el = document.querySelector('.react-flow')
    if (!el) return
    // Fit all nodes first, then capture on a clean WHITE page with NO dot grid.
    rfInstance.current?.fitView({ padding: 0.15 })
    return new Promise(r => setTimeout(r, 300))
      .then(() => import('html-to-image'))
      .then(({ toPng }) => toPng(el, {
        backgroundColor: '#ffffff',
        pixelRatio: 2,
        filter: node => !(node.classList && node.classList.contains('react-flow__background')),
      }))
      .then(url => {
        const a = document.createElement('a'); a.href = url; a.download = exportFilename('png'); a.click()
      })
      .catch(() => showToastMsg('PNG export requires html-to-image package'))
  }

  // Shared capture treatment: fit everything, drop the dot grid, white page.
  // Every raster export goes through this so PNG, WebP and GIF frame identically.
  function captureSetup() {
    const el = document.querySelector('.react-flow')
    if (!el) return null
    rfInstance.current?.fitView({ padding: 0.15 })
    return el
  }
  const captureOpts = {
    backgroundColor: '#ffffff',
    filter: node => !(node.classList && node.classList.contains('react-flow__background')),
  }

  // WebP is the same picture as the PNG at roughly a third of the bytes, which
  // matters when a diagram is pasted into a doc or an issue.
  function exportWebp() {
    const el = captureSetup()
    if (!el) return
    return new Promise(r => setTimeout(r, 300))
      .then(() => import('html-to-image'))
      .then(({ toCanvas }) => toCanvas(el, { ...captureOpts, pixelRatio: 2 }))
      .then(canvas => new Promise(res => canvas.toBlob(res, 'image/webp', 0.92)))
      .then(blob => {
        if (!blob) throw new Error('webp unsupported')
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob); a.download = exportFilename('webp'); a.click()
        URL.revokeObjectURL(a.href)
      })
      .catch(() => showToastMsg('WebP export failed'))
  }

  // An animated GIF of the flowing dots. This is the only export that shows the
  // diagram MOVING, which is the whole reason to pick GIF over PNG: it autoplays
  // in Slack, GitHub and Notion, where a video will not.
  //
  // The dots are pinned and stepped by hand (see flowClock) so the N frames are
  // exactly evenly spaced around one period and the loop closes seamlessly.
  // pixelRatio is 1 and the canvas is capped: a GIF is 256 colours and paletted,
  // so retina pixels buy nothing but megabytes.
  async function exportGif() {
    const el = captureSetup()
    if (!el) return
    const FRAMES = 20
    showToastMsg('Recording GIF...')
    try {
      const [{ toCanvas }, { GIFEncoder, quantize, applyPalette }] = await Promise.all([
        import('html-to-image'), import('gifenc'),
      ])
      const clock = flowClock
      await new Promise(r => setTimeout(r, 300))

      clock.beginCapture()
      const gif = GIFEncoder()
      const delay = Math.round(clock.CAPTURE_PERIOD_MS / FRAMES)
      let w = 0, h = 0

      for (let i = 0; i < FRAMES; i++) {
        clock.stepCapture(i / FRAMES)
        // Let React commit the new cx/cy before the DOM is serialised, or the
        // frame captures the previous position and the dot stutters.
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
        const canvas = await toCanvas(el, { ...captureOpts, pixelRatio: 1 })
        w = canvas.width; h = canvas.height
        const data = canvas.getContext('2d').getImageData(0, 0, w, h).data
        const palette = quantize(data, 256)
        gif.writeFrame(applyPalette(data, palette), w, h, { palette, delay })
      }
      gif.finish()
      clock.endCapture()

      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([gif.bytes()], { type: 'image/gif' }))
      a.download = exportFilename('gif'); a.click()
      URL.revokeObjectURL(a.href)
      showToastMsg('GIF saved')
    } catch {
      flowClock.endCapture()
      showToastMsg('GIF export failed')
    }
  }

  function exportJson() {
    const data = activeDiagram?.data || diagramData
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    a.download = exportFilename('json'); a.click()
  }

  function exportCode() {
    const data = activeDiagram?.data || diagramData
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'text/plain' }))
    a.download = exportFilename('txt'); a.click()
  }

  // Sharing a PRIVATE diagram hands someone a 404 and previews as the generic
  // site card, because the share page and the OG renderer both refuse unlisted
  // designs. So sharing publishes first: one deliberate act, and the recipient
  // gets a working link with a real card. Mirrors the diagrams app.
  async function ensureShareable() {
    if (!canAI || !activeDiagram?.id || activeDiagram.is_public) return
    try {
      const r = await fetch(`/api/flows/${activeDiagram.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_public: true }),
      })
      if (r.ok) {
        setActiveDiagram(a => (a ? { ...a, is_public: true } : a))
        setDiagrams(ds => ds.map(d => (d.id === activeDiagram.id ? { ...d, is_public: true } : d)))
        showToastMsg('Published - anyone with the link can open it')
      }
    } catch { /* sharing the link still works if this fails */ }
  }

  // The header pill: flip the open diagram between public (anyone with the
  // link) and private (owner only), and keep the gallery copy in step.
  async function toggleVisibility() {
    if (!canAI || !activeDiagram?.id) return
    const next = activeDiagram.is_public === false
    try {
      const r = await fetch(`/api/flows/${activeDiagram.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_public: next }),
      })
      if (!r.ok) throw new Error()
      setActiveDiagram(a => (a ? { ...a, is_public: next } : a))
      setDiagrams(ds => ds.map(d => (d.id === activeDiagram.id ? { ...d, is_public: next } : d)))
      showToastMsg(next ? 'Public - anyone with the link can open it' : 'Private - only you can open it')
    } catch {
      showToastMsg('Could not change visibility')
    }
  }

  async function copyLink() {
    await ensureShareable()
    const url = shareUrl
    navigator.clipboard.writeText(url).then(() => {
      setCopiedLink(true); setTimeout(() => setCopiedLink(false), 1500)
      showToastMsg('Link copied!')
    })
  }

  async function shareAction() {
    await ensureShareable()
    const url = shareUrl
    if (navigator.share) {
      navigator.share({ title: activeDiagram?.title || 'Flows', url }).catch(() => {})
    } else {
      navigator.clipboard.writeText(url).then(() => {
        setCopiedShare(true); setTimeout(() => setCopiedShare(false), 1500)
        showToastMsg('Link copied!')
      })
    }
  }

  function copyCode() {
    const data = activeDiagram?.data || diagramData
    navigator.clipboard.writeText(JSON.stringify(data, null, 2)).then(() => {
      setCopiedCode(true); setTimeout(() => setCopiedCode(false), 1500)
    })
  }

  // ── Zoom HUD ────────────────────────────────────────────────────────────────
  // Only show on an actual zoom change - panning keeps the same zoom, so it
  // must never flash the HUD.
  function flashZoomHud(z) {
    if (!zoomHudRef.current) return
    const prev = lastZoomRef.current
    lastZoomRef.current = z
    if (prev !== null && Math.abs(z - prev) < 0.001) return // pan, not zoom
    zoomHudRef.current.textContent = `${Math.round(z * 100)}%`
    zoomHudRef.current.style.opacity = '1'
    if (zoomHudTimer.current) clearTimeout(zoomHudTimer.current)
    zoomHudTimer.current = setTimeout(() => {
      if (zoomHudRef.current) zoomHudRef.current.style.opacity = '0'
    }, 900)
  }

  // ── DETAIL VIEW ─────────────────────────────────────────────────────────────
  // Start/Destination marker nodes are always shown (auto-detected from edges).
  const markers = buildMarkers(nodes, edges)
  const displayNodes = [...nodes, ...markers.nodes]
  const displayEdges = [...edges, ...markers.edges]
  // Step-by-step walkthrough, derived from the diagram's edges in flow order.
  const steps = (activeDiagram?.data?.edges || []).map((e, i) => ({
    n: i + 1,
    from: findService({ id: e.source })?.label || e.source,
    to: findService({ id: e.target })?.label || e.target,
    label: e.label || '',
  }))
  return (
    <DetailView
      toast={toast} showToastMsg={showToastMsg}
      setView={setView}
      showDetailCode={showDetailCode} setShowDetailCode={setShowDetailCode}
      rfInstance={rfInstance} flashZoomHud={flashZoomHud} zoomHudRef={zoomHudRef}
      showSharePanel={showSharePanel} setShowSharePanel={setShowSharePanel}
      showDetailsPanel={showDetailsPanel} setShowDetailsPanel={setShowDetailsPanel}
      steps={steps}
      showSteps={showSteps} setShowSteps={setShowSteps}
      showNotes={showNotes} setShowNotes={setShowNotes}
      isLocked={!!activeDiagram?.locked} onToggleLock={canAI ? toggleLock : undefined}
      badgeMode={badgeMode} setBadgeMode={setBadgeMode}
      activeDiagram={activeDiagram}
      detailCodeCopied={detailCodeCopied} setDetailCodeCopied={setDetailCodeCopied}
      nodes={displayNodes} edges={displayEdges} onNodesChange={onNodesChange}
      onNodeDragStop={onNodeDragStop} snapGuides={snapGuides}
      canUndo={history.past.length > 0} canRedo={history.future.length > 0} onUndo={undo} onRedo={redo}
      shareSlug={shareSlug} shareUrl={shareUrl}
      onDeleteDiagram={canAI && activeDiagram?.id ? () => deleteDiagram(activeDiagram.id, { thenBack: true }) : undefined}
      exportPng={exportPng} exportWebp={exportWebp} exportGif={exportGif} exportCode={exportCode} exportJson={exportJson}
      copyLink={copyLink} copiedLink={copiedLink}
      shareAction={shareAction} copiedShare={copiedShare}
      copyCode={copyCode} copiedCode={copiedCode}
      showDocs={showDocs} setShowDocs={setShowDocs}
      copiedLabel={copiedLabel} onCopyFormat={copyFormat}
      isPublic={isDemo || !user}
      saveState={saveState}
      onArrange={autoArrange}
      onNoteChange={canAI ? onNoteChange : undefined}
      isDiagramPublic={activeDiagram?.is_public !== false}
      canEdit={canAI}
      onToggleVisibility={canAI && activeDiagram?.id ? toggleVisibility : undefined}
      onShareOpen={canAI && activeDiagram?.id ? ensureShareable : undefined}
    />
  )
}
