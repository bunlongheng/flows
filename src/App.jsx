import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react'
import * as flowClock from './flowClock'
import { applyNodeChanges, applyEdgeChanges } from '@xyflow/react'
import diagramData from './data/diagram.json'
import SignInScreen from './components/SignInScreen'
import ClosedFlowScreen from './components/ClosedFlowScreen'
import { IndexView } from './views/IndexView'
import { DetailView } from './views/DetailView'
import { layoutElements } from './layout'
import { layoutFanOut } from './layoutFan.js'
import { rowToDiagram } from './rowToDiagram'
import { snapSuggest } from './snapAlign'
import { findService } from './services'
import { laneNodes, laneRef, laneNodeId, LANE_INK, LANE_MIN, cardsColor, cleanLanes, laneAxis, laneRects, laneSpan, sectionRects, resortSections, moveLane, HAND_MIN_PAD, SECTION_PAD, LANE_GAP } from './lanes.js'
import { getNoteHeight, subscribeNoteHeights, noteHeightsVersion } from './components/noteEditContext'
import { SUNSET, INK } from './sunset.js'
import { cleanDesc } from './tag'
import { cleanEdgeLabel } from './note.js'
import { fireflies } from './fireflies'
import { makeThumbnail } from './thumbnail'
import { currentOf, cleanCurrent } from './view-state.js'
import { sizingOf, lineCounts, cardSize } from './card-size.js'

// A card's drawn size for the diagram's sizing mode; a picture card scales
// from its own 240 x 225.
const sizedCard = (nd, mode, lines) => cardSize(nd, mode, lines.get(nd.id),
  typeof nd.image === 'string' && nd.image.startsWith('data:image/') ? { w: 240, h: 225 } : { w: 180, h: 180 })

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

// The other half of a snapshot: everything the owner has pinned by hand on the
// edges. A bent line is an edit like any other, so Cmd+Z has to walk it back
// the same way it walks back a drag - which it could not do while a snapshot
// was node positions and nothing else.
const pinsOf = eds => eds.map(e => ({
  id: e.id,
  labelT: e.data?.labelT,
  ends: e.data?.ends,
  bend: e.data?.bend,
}))

// The bits of an edge worth persisting: its id, its badge position, and its
// pinned ends. Shared by every PATCH so the server always receives both
// fields for every edge, not just the one the owner just dragged.
const edgePins = edges => edges.map((e, i) => ({
  id: e.id || `e${i}`,
  ...(typeof e.labelT === 'number' ? { labelT: e.labelT } : {}),
  ...(e.ends ? { ends: e.ends } : {}),
  ...(e.bend ? { bend: e.bend } : {}),
}))

// Every edge renders as a gradient (source color -> target color) and is
// animated with marching motion. Node id === service key, so we can look up
// each endpoint's brand color directly.
// onLabelMove and onEndMove are threaded into every edge's data so a badge or a
// pinned end can be dragged. Both are omitted for the bundled sample and for a
// read-only viewer, and the edge renders inert in that case.
function buildEdges(rawEdges, onLabelMove, rawNodes, onEndMove, onBendMove, lanes = [], onLabelEdit) {
  // The edge takes its colour from the SOURCE node, and a node that brings its
  // own logo states its colour only in that logo - so the node itself has to be
  // looked up, not just its id. Passing `{ id }` alone matched generic catalog
  // entries (`browser`, `cli`, `api`) and painted a Chrome edge pink.
  const byId = new Map((rawNodes || []).map(n => [n.id, n]))
  // An edge touching a sunset node is a faint silver line at both ends, and an
  // edge INTO one also carries the flag so its badge goes grey with the red X.
  const sunsetOf = id => byId.get(id)?.sunset === true
  // An end on a lane ("lane:<id>") is the lane's React Flow node, in the lane's ink.
  // An unconfigured lane draws in its cards' colour (src/lanes.js cardsColor), so its lines do too.
  const laneColor = id => {
    const l = lanes.find(l => l.id === laneRef(id))
    if (!l) return LANE_INK
    const [at, size] = 'x' in l ? ['x', 'w'] : ['y', 'h']
    const inside = (rawNodes || []).filter(n => !n.sunset && n.position?.[at] >= l[at] && n.position[at] < l[at] + l[size])
    return l.color || cardsColor(inside.map(n => ({ color: findService(n)?.color }))) || LANE_INK
  }
  const edgeColor = id => (laneRef(id) ? laneColor(id) : sunsetOf(id) ? SUNSET.border : findService(byId.get(id) || { id })?.color || INK)
  const rfId = id => (laneRef(id) ? laneNodeId(laneRef(id)) : id)
  return rawEdges.map((e, i) => ({
    id: e.id || `e${i}`,
    source: rfId(e.source),
    target: rfId(e.target),
    label: e.label,
    type: 'gradient',
    animated: true,
    data: {
      sourceColor: edgeColor(e.source), targetColor: edgeColor(e.target), step: i + 1,
      ...(sunsetOf(e.source) || sunsetOf(e.target) ? { sunset: true } : {}),
      ...(sunsetOf(e.source) || sunsetOf(e.target) ? { sunsetLine: true } : {}),
      ...(typeof e.labelT === 'number' ? { labelT: e.labelT } : {}),
      ...(e.async === true ? { async: true } : {}),
      ...(e.ends ? { ends: e.ends } : {}),
      ...(e.bend ? { bend: e.bend } : {}),
      ...(e.style ? { style: e.style } : {}),
      ...(cleanDesc(e.description) ? { description: cleanDesc(e.description) } : {}),
      ...(onLabelMove ? { onLabelMove } : {}),
      ...(onLabelEdit ? { onLabelEdit } : {}),
      ...(onEndMove ? { onEndMove } : {}),
      ...(onBendMove ? { onBendMove } : {}),
    },
  }))
}

// Exactly ONE "Start here" pill per diagram - the source of step 1, which is
// robust even for closed loops. There is deliberately no Destination pill: it
// guessed at an endpoint the diagram never claimed, and where a flow BEGINS is
// the only hint a reader actually needs.
const NODE_W = 190, NODE_H = 180 // nominal card size, for the free-space check
const MARKER_GAP = 96            // pill height + connector run

// A card's real footprint when the owner has resized it; the nominal size
// otherwise (a picture node, or one never touched).
const sizeOf = n => ({ w: n.data?.size?.w ?? NODE_W, h: n.data?.size?.h ?? NODE_H })

function buildMarkers(nodes, edges, override, draggable) {
  if (!nodes.length) return { nodes: [], edges: [] }
  const byId = id => nodes.find(n => n.id === id)
  const hasIncoming = new Set(edges.map(e => e.target))

  // Start: source of the first edge; else any node with no incoming edge; else node 0.
  let startId = edges[0] && edges[0].source && byId(edges[0].source) ? edges[0].source : null
  if (!startId) startId = (nodes.find(n => !hasIncoming.has(n.id)) || nodes[0]).id
  const s = byId(startId)
  if (!s) return { nodes: [], edges: [] }
  const p = s.position || { x: 0, y: 0 }
  const { w: sw, h: sh } = sizeOf(s)

  // The owner dragged the pill somewhere of their own choosing - draw it there
  // and skip the automatic face-picking below, but keep the arrow pointed at
  // the start node by working out which side of the card the pill now faces.
  if (override && Number.isFinite(override.x) && Number.isFinite(override.y)) {
    const pillCenter = { x: override.x + 66, y: override.y + 18 }
    const cardCenter = { x: p.x + sw / 2, y: p.y + sh / 2 }
    const dx = cardCenter.x - pillCenter.x, dy = cardCenter.y - pillCenter.y
    const dir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up')
    return {
      nodes: [{ id: `__start_${startId}`, type: 'marker', position: { x: override.x, y: override.y }, width: 132, height: 36, data: { kind: 'start', dir, control: !!draggable }, draggable: !!draggable, selectable: false }],
      edges: [],
    }
  }

  // The pill must never share a face with an edge - a green arrow landing on the
  // same side as a real connection reads as part of the flow. So work out which
  // faces this node's edges already use and take the first free one, preferring
  // top (a diagram reads downward), then left, then the remaining sides.
  const nodeCenter = n => ({ x: (n.position?.x ?? 0) + NODE_W / 2, y: (n.position?.y ?? 0) + NODE_H / 2 })
  const used = new Set()
  const sc = nodeCenter(s)
  for (const e of edges) {
    const otherId = e.source === startId ? e.target : e.target === startId ? e.source : null
    const other = otherId && byId(otherId)
    if (!other) continue
    const oc = nodeCenter(other)
    const dx = oc.x - sc.x, dy = oc.y - sc.y
    used.add(Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'bottom' : 'top'))
  }

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
    bottom: { pos: { x: p.x + 6, y: p.y + sh + 40 }, dir: 'up' },
    left: { pos: { x: p.x - 200, y: p.y + sh / 2 - 18 }, dir: 'right' },
    right: { pos: { x: p.x + 205, y: p.y + sh / 2 - 18 }, dir: 'left' },
  }[side]
  return {
    nodes: [{ id: `__start_${startId}`, type: 'marker', position: place.pos, width: 132, height: 36, data: { kind: 'start', dir: place.dir, control: !!draggable }, draggable: !!draggable, selectable: false }],
    edges: [],
  }
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
  // The Start pill's live position while it is being dragged - not yet saved,
  // so it has to win over the saved view_state.start until the drag ends.
  const [startDrag, setStartDrag] = useState(null)
  // A band the owner is dragging (#468) previews here until the drop saves it.
  const [laneDraft, setLaneDraft] = useState(null)
  const bandDrag = useRef(null)
  // The band the owner picked, drawn with a selection frame (Figma style).
  const [selBand, setSelBand] = useState(null)
  useEffect(() => {
    if (!selBand) return
    const onKey = e => { if (e.key === 'Escape') setSelBand(null) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selBand])
  const [nodes, setNodes] = useState(defaultNodes)
  const [edges, setEdges] = useState(defaultEdges)
  const [toast, setToast] = useState({ message: '', visible: false })
  // One current walks the diagram 1 beat at a time (a line marked async shares
  // the beat of the line before it), so the cycle is 1 slot per beat and the
  // clock has to know how many there are. Keyed on the COUNT, not the array:
  // the edges state is rebuilt every frame.
  const beatN = flowClock.beatCount(edges)
  useEffect(() => { flowClock.setSteps(beatN) }, [beatN])
  // How fast the current runs and how many small dots it carries, from the row
  // and changed from the Start pill's panel (owner 2026-10-09). Held here as
  // well as in view_state so a click lands on the dots at once rather than
  // after the PATCH comes back.
  const [current, setCurrentState] = useState(() => currentOf(null))
  const [sizing, setSizingState] = useState('match')
  useEffect(() => { flowClock.setCurrent(current) }, [current])
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
  const [showHistoryPanel, setShowHistoryPanel] = useState(false)
  const [showSteps, setShowSteps] = useState(false)
  // Notes show unless a diagram has been toggled off - see 'notes-off' below.
  const [showNotes, setShowNotes] = useState(true)
  // A note growing or shrinking changes how far its lane reaches, so the lanes redraw with the notes.
  useSyncExternalStore(subscribeNoteHeights, noteHeightsVersion)
  const [badgeMode, setBadgeMode] = useState('dark') // dark | silver | color | plain
  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedShare, setCopiedShare] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)
  // The gallery starts EMPTY, never on the bundled sample. Seeding state with
  // SEED meant every cold load flashed an IFTTT card the owner does not own,
  // which read as a real diagram appearing and then vanishing. The sample is
  // still the fallback, but only once the fetch has actually come back empty.
  const [diagrams, setDiagrams] = useState([])
  const [listLoading, setListLoading] = useState(true)
  // Logged-in home has two tabs (top-right button group): 'mine' = my personal
  // (non-demo) diagrams, 'demos' = the 12 curated public demos so the owner can
  // reopen + re-arrange them and have the layout persist. Public /demo ignores this.
  const [galleryTab, setGalleryTab] = useState('mine') // 'mine' | 'linked' | 'demos'
  // Work vs personal. Twenty diagrams in one list meant hunting for the one that
  // matters; this splits the day job from stock bots and practice designs.
  const [loadingId, setLoadingId] = useState(false)
  // false, an HTTP status from the flow fetch, or 'network' when nothing answered.
  const [loadError, setLoadError] = useState(false)
  const [listError, setListError] = useState(false) // gallery fetch failed
  const [user, setUser] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  // Panel memory waiting for ownership to settle on a cold deep link (see openDiagram).
  const pendingPanels = useRef(null)
  // Local starts past the sign-in card: Google never sends a browser back to
  // a local origin, and the API already trusts localhost, so the card could
  // only offer the dev link. Production starts gated as before. Read here,
  // not from IS_DEV, so a test can stand in a production build.
  const [devBypass, setDevBypass] = useState(process.env.NODE_ENV !== 'production')
  const canAI = (Boolean(user) || IS_DEV) && !isDemo
  const rfInstance = useRef(null)
  // Snap suggestions: the guides to draw, plus a live "is Cmd/Ctrl down" flag.
  // The modifier SUSPENDS snapping now rather than arming it - suggestions are
  // the default, and the key is the way to overrule them. The flag is a ref
  // because it is read inside the drag handler on every frame.
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
  // Record the canvas as it was BEFORE an edit. A new edit clears the redo pile,
  // the same as every editor. 50 steps is far more than anyone walks back.
  // `pins` defaults to the edges as they stand: every caller records the state
  // before its own change, and a node drag does not touch them anyway.
  const pushHistory = useCallback((positions, kind, pins) => {
    const step = { positions, kind, pins: pins || pinsOf(edgesRef.current) }
    setHistory(h => ({ past: [...h.past, step].slice(-50), future: [] }))
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
      .finally(() => setListLoading(false))
  }, [isDemo, galleryTab])

  useEffect(() => { setListLoading(true); loadDiagrams() }, [loadDiagrams])

  // Owner sign-in state + one-time feedback from the OAuth redirect (?auth=).
  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      if (d.authenticated) return setUser(d)
      // The owner opening their own shared link in a browser that is signed
      // into Google but not into Flows should land in the editor, not the
      // read-only view, without hunting for a Sign in button that a shared
      // link no longer has. So a shared link asks Google once, silently, and
      // comes straight back either way (see auth-login ?silent). Once per tab:
      // a stranger's browser answers no every time, and the round trip is not
      // free. The demo and the index have their own screens and never ask,
      // and a local build never asks: Google only sends a browser back to
      // the deployed origin, and a local owner has the dev bypass.
      const q = new URLSearchParams(window.location.search)
      const local = /^([a-z0-9-]+\.)*(localhost|127\.0\.0\.1)$/i.test(window.location.hostname)
      if (IS_DEV || local || window.location.pathname === '/demo' || !(q.get('id') || q.get('name'))) return
      try {
        if (sessionStorage.getItem('sd_silent_auth')) return
        sessionStorage.setItem('sd_silent_auth', '1')
      } catch { return }
      window.location.replace('/api/auth/login?silent=1')
    }).catch(() => {}).finally(() => setAuthChecked(true))
    const p = new URLSearchParams(window.location.search).get('auth')
    if (p === 'denied') showToastMsg('That Google account is not authorized')
    else if (p === 'error') showToastMsg('Sign-in failed, try again')
    if (p) { const u = new URL(window.location.href); u.searchParams.delete('auth'); window.history.replaceState({}, '', u) }
  }, [showToastMsg])

  function signOut() {
    fetch('/api/auth/logout', { method: 'POST' }).then(() => { setUser(null); showToastMsg('Signed out') }).catch(() => showToastMsg('Sign out failed'))
  }

  // Two locks, both off on a new flow until the owner turns one on here. The
  // delete lock keeps Delete inert, in the app and for agents. The edit lock
  // keeps agents (MCP, the API) from rewriting the flow; the owner's own
  // edits in the app never answer to it. This only flips the flags; the
  // guards that matter live in the handlers and the MCP server.
  async function setLocks(patch) {
    if (!activeDiagram?.id) return
    const res = await fetch(`/api/flows/${activeDiagram.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!res.ok) { showToastMsg('Could not change the lock'); return }
    const row = await res.json()
    setActiveDiagram(a => (a ? { ...a, locked: !!row.locked, editLocked: !!row.edit_locked } : a))
    if (typeof patch.locked === 'boolean') showToastMsg(patch.locked ? 'Delete locked' : 'Delete unlocked - it can be deleted now')
    else showToastMsg(patch.edit_locked ? 'Edit locked - agents cannot change it' : 'Edit unlocked - agents can change it now')
  }

  function deleteDiagram(id, { thenBack = false } = {}) {
    fetch(`/api/flows/${id}`, { method: 'DELETE' }).then(res => {
      if (!res.ok) { showToastMsg('Delete failed'); return }
      // Measure the card (or the open canvas) BEFORE React drops it, then let
      // the fireflies take its place - once it is unmounted there is nothing
      // to measure and the swarm would land in the top-left corner.
      if (thenBack) fireflies(document.querySelector('.react-flow'))
      else fireflies(document.querySelector(`[data-flow-id="${id}"]`), { tiny: true })
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
    pushHistory(positionsOf(nodesRef.current), 'edge')
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
        fetch(`/api/flows/${a.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ edges: edgePins(data.edges) }),
        }).catch(() => {})
      }
      return { ...a, data }
    })
  }, [pushHistory])

  // A pinned edge end: which face of the box the line meets and where along
  // it. `end` is { side, at }, or null (double-click) to go back to automatic.
  const onEndMove = useCallback((edgeId, which, end) => {
    pushHistory(positionsOf(nodesRef.current), 'edge')
    const mergeEnds = ends => {
      const next = { ...(ends || {}) }
      if (end) next[which] = end; else delete next[which]
      return Object.keys(next).length ? next : undefined
    }
    setEdges(prev => prev.map(e => (e.id === edgeId
      ? { ...e, data: { ...e.data, ends: mergeEnds(e.data?.ends) } }
      : e)))
    setActiveDiagram(a => {
      if (!a) return a
      const data = { ...a.data, edges: (a.data.edges || []).map((e, i) => ((e.id || `e${i}`) === edgeId
        ? { ...e, ends: mergeEnds(e.ends) }
        : e)) }
      if (a.id) {
        fetch(`/api/flows/${a.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ edges: edgePins(data.edges) }),
        }).catch(() => {})
      }
      return { ...a, data }
    })
  }, [pushHistory])

  // A hand-bent line: `bend` is { t, d } relative to the straight run, or
  // null (double-click) to let the line route itself again.
  const onBendMove = useCallback((edgeId, bend) => {
    pushHistory(positionsOf(nodesRef.current), 'edge')
    const b = bend || undefined
    setEdges(prev => prev.map(e => (e.id === edgeId ? { ...e, data: { ...e.data, bend: b } } : e)))
    setActiveDiagram(a => {
      if (!a) return a
      const data = { ...a.data, edges: (a.data.edges || []).map((e, i) => ((e.id || `e${i}`) === edgeId ? { ...e, bend: b } : e)) }
      if (a.id) {
        fetch(`/api/flows/${a.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ edges: edgePins(data.edges) }),
        }).catch(() => {})
      }
      return { ...a, data }
    })
  }, [pushHistory])

  // The owner edited a node's note (double-click the caption, or "+ note") or
  // its info (the i badge). One deliberate edit, saved at once by id - never
  // bundled into a layout save, which a stale tab replays on every drag. ''
  // removes the field.
  const activeId = activeDiagram?.id
  // State only. Split out so a field that writes many times a second (the
  // format panel) can paint instantly and send once.
  const applyNodeField = useCallback((field, nodeId, value) => {
    const withField = nd => { const { [field]: _old, ...rest } = nd; return value ? { ...rest, [field]: value } : rest }
    const patch = nds => (nds || []).map(nd => (nd.id === nodeId ? withField(nd) : nd))
    setNodes(prev => prev.map(n => (n.id === nodeId ? { ...withField(n), data: { ...n.data, [field]: value } } : n)))
    setActiveDiagram(a => (a ? { ...a, data: { ...a.data, nodes: patch(a.data.nodes) } } : a))
    if (!activeId) return
    setDiagrams(ds => ds.map(d => (d.id !== activeId ? d : { ...d, data: { ...d.data, nodes: patch(d.data.nodes) } })))
  }, [activeId])

  const saveNodeText = useCallback((field, nodeId, value) => {
    applyNodeField(field, nodeId, value)
    if (!activeId) return
    const label = field === 'info' ? 'Info' : 'Note'
    fetch(`/api/flows/${activeId}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: [{ id: nodeId, [field]: value }] }),
    })
      .then(r => showToastMsg(r.ok ? (value ? `${label} saved` : `${label} removed`) : 'Could not save (owner only)'))
      .catch(() => showToastMsg('Could not save'))
  }, [activeId, applyNodeField, showToastMsg])
  const onNoteChange = useCallback((nodeId, note) => saveNodeText('note', nodeId, note), [saveNodeText])

  // The format panel fires a write per click, and 5 PATCHes racing to the same
  // row do NOT arrive in the order they were sent - the e2e caught the last two
  // settings of a fast run missing from the stored node. So the card repaints on
  // the click and exactly one request goes out once the clicking stops, carrying
  // whatever the style ended up being. null is what clears it.
  const styleSend = useRef({})
  const sendStyle = useCallback((key, body) => {
    if (!activeId) return
    clearTimeout(styleSend.current[key])
    styleSend.current[key] = setTimeout(() => {
      delete styleSend.current[key]
      fetch(`/api/flows/${activeId}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
        .then(r => { if (!r.ok) showToastMsg('Could not save (owner only)') })
        .catch(() => showToastMsg('Could not save'))
    }, 350)
  }, [activeId, showToastMsg])

  // A line's style has its own PATCH key, not the pins one: that branch wipes
  // every pin it was not sent, so folding style in would make a badge drag and
  // a colour pick able to erase each other.
  const onEdgeStyleChange = useCallback((edgeId, style) => {
    // A hand bend and a picked arrow type answer the same question - how does
    // this line get there - and the bend wins in the renderer. So picking an
    // arrow type drops the bend, or the pick lands on a line that never moves
    // and the row reads as a control that does not work. Cmd+Z brings it back.
    if (style?.arrow && edgesRef.current.find(e => e.id === edgeId)?.data?.bend) onBendMove(edgeId, null)
    const withStyle = ed => { const { style: _old, ...rest } = ed; return style ? { ...rest, style } : rest }
    setEdges(prev => prev.map(e => (e.id === edgeId ? { ...e, data: { ...e.data, style } } : e)))
    const patch = eds => (eds || []).map((ed, i) => ((ed.id || `e${i}`) === edgeId ? withStyle(ed) : ed))
    setActiveDiagram(a => (a ? { ...a, data: { ...a.data, edges: patch(a.data.edges) } } : a))
    setDiagrams(ds => ds.map(d => (d.id !== activeId ? d : { ...d, data: { ...d.data, edges: patch(d.data.edges) } })))
    sendStyle(`e:${edgeId}`, { edgeStyles: [{ id: edgeId, style }] })
  }, [activeId, sendStyle, onBendMove])

  // The badge text, rewritten where it is drawn: double-click the badge on the
  // line, type, Enter. It rides the edgeStyles key for the same reason style
  // does - the pins branch wipes what it was not sent - and '' drops the badge.
  const onLabelEdit = useCallback((edgeId, label) => {
    const text = cleanEdgeLabel(label)
    setEdges(prev => prev.map(e => (e.id === edgeId ? { ...e, label: text } : e)))
    const patch = eds => (eds || []).map((ed, i) => {
      if ((ed.id || `e${i}`) !== edgeId) return ed
      const { label: _old, ...rest } = ed
      return text ? { ...rest, label: text } : rest
    })
    setActiveDiagram(a => (a ? { ...a, data: { ...a.data, edges: patch(a.data.edges) } } : a))
    setDiagrams(ds => ds.map(d => (d.id !== activeId ? d : { ...d, data: { ...d.data, edges: patch(d.data.edges) } })))
    if (!activeId) return
    fetch(`/api/flows/${activeId}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ edgeStyles: [{ id: edgeId, label: text }] }),
    })
      .then(r => showToastMsg(r.ok ? (text ? 'Label saved' : 'Label removed') : 'Could not save (owner only)'))
      .catch(() => showToastMsg('Could not save'))
  }, [activeId, showToastMsg])

  // A cold ?name= / ?id= load resolves the design BEFORE /api/auth/me answers, so
  // canAI was still false when the edges were built and no badge came out
  // draggable. Re-attach (or strip) the handler whenever ownership settles.
  useEffect(() => {
    if (view !== 'detail') return
    setEdges(prev => prev.map(e => (
      Boolean(e.data?.onLabelMove) === canAI && Boolean(e.data?.onEndMove) === canAI && Boolean(e.data?.onBendMove) === canAI && Boolean(e.data?.onLabelEdit) === canAI
        ? e
        : { ...e, data: { ...e.data, onLabelMove: canAI ? onLabelMove : undefined, onEndMove: canAI ? onEndMove : undefined, onBendMove: canAI ? onBendMove : undefined, onLabelEdit: canAI ? onLabelEdit : undefined } }
    )))
  }, [canAI, view, onLabelMove, onEndMove, onBendMove, onLabelEdit])

  // Node/edge mapping shared by opening a diagram and restoring a history
  // version: carries brand fields into node data, keeps a saved layout as-is,
  // and auto-arranges as a fan only when nothing was saved.
  function buildDiagramNodesEdges(d) {
    const raw = d.data.nodes || []
    // Use the owner's saved layout when every node has a stored position;
    // otherwise auto-layout as a fan so nothing overlaps.
    const hasSaved = raw.length > 0 && raw.every(nd => nd.position && Number.isFinite(nd.position.x) && Number.isFinite(nd.position.y))
    // Carry any custom brand fields (label/icon/color/sub) into node data so a
    // bring-your-own-icon node renders its own logo, not a catalog lookup.
    // The card's drawn size follows the diagram's Match / Auto / Custom pick
    // (src/card-size.js); `handSize` keeps the owner's own, the only one saved.
    const mode = sizingOf(d.view_state, raw), lines = lineCounts(d.data.edges)
    const n = raw.map(nd => {
      const size = sizedCard(nd, mode, lines)
      return { ...nd, type: 'awsNode', data: { id: nd.id, label: nd.label, icon: nd.icon, image: nd.image, color: nd.color, sub: nd.sub, note: nd.note, info: nd.info, sunset: nd.sunset === true, iconFrame: nd.iconFrame === true, size, handSize: nd.size, iconSize: nd.iconSize, style: nd.style }, ...(hasSaved ? { position: nd.position } : {}), ...(size ? { width: size.w, height: size.h } : {}) }
    })
    const e = buildEdges(d.data.edges, canAI ? onLabelMove : undefined, raw, canAI ? onEndMove : undefined, canAI ? onBendMove : undefined, d.view_state?.lanes || [], canAI ? onLabelEdit : undefined)
    return { nodes: hasSaved ? n : layoutFanOut(n, e), edges: e }
  }

  function openDiagram(d) {
    setActiveDiagram(d)
    setHistory({ past: [], future: [] })
    setStartDrag(null)
    // Reopen where you left off: the panel that was open and the badge style
    // you picked travel with the row, so a diagram never resets to a bare
    // canvas. Anything unsaved falls back to the defaults.
    const v = d.view_state || {}
    // `panels` is the set that was open. Rows saved before this shape used a
    // single `panel`, so fold that in rather than dropping their state.
    const open = Array.isArray(v.panels) ? v.panels : v.panel ? [v.panel] : []
    // A visitor sees the diagram the way the owner left it: Steps and Notes
    // open only when the owner left them open, and no controls to change
    // that. Code is the owner's editor and the share panel is never restored
    // for anyone: opening it is an action (it publishes). A cold ?name= load
    // resolves before /api/auth/me answers, so the owner's full set waits and
    // applies once ownership settles.
    setShowSharePanel(false)
    applyPanels(canAI ? open : open.filter(p => p !== 'code'))
    pendingPanels.current = canAI || authChecked ? null : open
    if (['dark', 'silver', 'color', 'plain'].includes(v.badge)) setBadgeMode(v.badge)
    setCurrentState(currentOf(v))
    setSizingState(sizingOf(v, d.data.nodes))
    const { nodes: n, edges: e } = buildDiagramNodesEdges(d)
    setNodes(n)
    setEdges(e)
    setView('detail')
    pendingFit.current = true
    // Deep link: ?id=<uuid>, unique and stable across renames. A diagram with no
    // slug (AI-generated or pasted, so nothing saved yet) leaves the URL alone -
    // there is nothing to link to. ?name= is still honoured on load for older links.
    if (d.slug && d.id) {
      const url = new URL(window.location.href)
      url.searchParams.delete('name')
      url.searchParams.set('id', d.id)
      // Pushed when this is somewhere new, replaced when the URL already says
      // it. Replacing unconditionally destroyed the list's history entry, so
      // the browser Back button left the app instead of going back to the
      // list - and on a phone the back gesture is the only back there is.
      window.history[url.href === window.location.href ? 'replaceState' : 'pushState']({}, '', url)
    }
  }

  function applyPanels(open) {
    // Every demo diagram opens with its steps numbered (owner rule 2026-10-08):
    // a reader on /demo is walking the flow, so the order is on from the start.
    setShowSteps(isDemo || open.includes('steps'))
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
        // Only the owner's hand size is saved: a Match or Auto size is drawn, never stored.
        ...(n.data?.handSize ? { size: n.data.handSize } : {}),
        iconSize: n.data?.iconSize ?? null,
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

  // Persist a view_state patch (panels/badge carried forward, start added or
  // dropped by the caller) and keep the local copies - activeDiagram and the
  // gallery list - in step, the same way the panel/badge effect does.
  const patchViewState = useCallback(view_state => {
    if (!activeDiagram?.id) return
    const savingId = activeDiagram.id
    fetch(`/api/flows/${savingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ view_state }),
    })
      .then(r => {
        if (!r.ok) return
        setActiveDiagram(a => (a ? { ...a, view_state } : a))
        setDiagrams(ds => ds.map(d => (d.id === savingId ? { ...d, view_state } : d)))
      })
      .catch(() => {})
  }, [activeDiagram])

  // Everything in view_state that is NOT the key being written. The canvas
  // PATCH replaces the whole object, so a save that rebuilt it from scratch
  // would silently clear the owner's lanes, Start placement or current.
  const otherView = useCallback(drop => {
    const prev = activeDiagram?.view_state || {}
    const keep = k => !drop.includes(k) && prev[k] !== undefined && prev[k] !== null
    return {
      ...(keep('panels') ? { panels: prev.panels } : {}),
      ...(keep('badge') ? { badge: prev.badge } : {}),
      ...(keep('lanes') ? { lanes: prev.lanes } : {}),
      ...(keep('start') ? { start: prev.start } : {}),
      ...(keep('current') ? { current: prev.current } : {}),
      ...(keep('sizing') ? { sizing: prev.sizing } : {}),
    }
  }, [activeDiagram])

  // The owner dropped the Start pill somewhere of their own choosing - save the
  // spot so it overrides the automatic placement from here on.
  const saveStart = useCallback(pos => {
    patchViewState({ ...otherView(['start']), start: { x: Math.round(pos.x), y: Math.round(pos.y) } })
    setStartDrag(null)
  }, [otherView, patchViewState])

  // A speed or amount preset from the current's panel: on the dots now, in the
  // row a moment later. Stored only once it differs from the default, the same
  // way the Start placement is (src/view-state.js).
  const setCurrent = useCallback(next => {
    const c = currentOf({ current: { ...current, ...next } })
    setCurrentState(c)
    patchViewState({ ...otherView(['current']), ...cleanCurrent(c) })
  }, [current, otherView, patchViewState])

  // Match, Auto or Custom card sizes from the same panel: every card redraws
  // now, and the pick is saved on the row so the exports draw the same.
  const setSizing = useCallback(mode => {
    setSizingState(mode)
    patchViewState({ ...otherView(['sizing']), sizing: mode })
    const lines = lineCounts(activeDiagram?.data?.edges)
    setNodes(nds => nds.map(n => {
      if (n.type !== 'awsNode') return n
      const size = sizedCard({ size: n.data.handSize, image: n.data.image, id: n.id }, mode, lines)
      const { width: _w, height: _h, ...rest } = n
      return { ...rest, ...(size ? { width: size.w, height: size.h } : {}), data: { ...n.data, size } }
    }))
  }, [activeDiagram, otherView, patchViewState])

  // The owner dragged a node's resize handle. Store the new size on the node
  // (both top-level, for React Flow's own sizing, and in data, for AwsNode's
  // card) and persist it the same way a drag persists position.
  const onNodeResize = useCallback((id, size) => {
    setNodes(nds => {
      const next = nds.map(n => n.id === id ? { ...n, width: size.w, height: size.h, data: { ...n.data, size, handSize: size } } : n)
      if (canAI && activeDiagram?.id) savePositions(activeDiagram.id, next)
      return next
    })
  }, [canAI, activeDiagram, savePositions])

  // The owner dragged the icon/photo's own handle, inside the card - independent
  // of the card's own size. null resets it to the shape's default (48x48 icon,
  // photo fills the card).
  const onIconResize = useCallback((id, iconSize) => {
    setNodes(nds => {
      const next = nds.map(n => n.id === id ? { ...n, data: { ...n.data, iconSize: iconSize ?? undefined } } : n)
      if (canAI && activeDiagram?.id) savePositions(activeDiagram.id, next)
      return next
    })
  }, [canAI, activeDiagram, savePositions])

  // Put the hand-pinned edge state back. The PATCH deletes every pin it is not
  // sent, so an undone bend is undone on the server too and stays undone
  // through a reload - the same contract the drag handlers use.
  const restorePins = useCallback(pins => {
    const byId = Object.fromEntries(pins.map(p => [p.id, p]))
    setEdges(prev => prev.map(e => (byId[e.id]
      ? { ...e, data: { ...e.data, labelT: byId[e.id].labelT, ends: byId[e.id].ends, bend: byId[e.id].bend } }
      : e)))
    setActiveDiagram(a => {
      if (!a) return a
      const edges = (a.data.edges || []).map((e, i) => {
        const p = byId[e.id || `e${i}`]
        if (!p) return e
        const next = { ...e }
        for (const k of ['labelT', 'ends', 'bend']) {
          if (p[k] === undefined) delete next[k]
          else next[k] = p[k]
        }
        return next
      })
      const data = { ...a.data, edges }
      if (a.id) {
        fetch(`/api/flows/${a.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ edges: edgePins(edges) }),
        }).catch(() => {})
      }
      return { ...a, data }
    })
  }, [])

  // Put a snapshot back on the canvas and persist it, so an undo survives reload.
  const applySnapshot = useCallback((step, refit) => {
    const byId = Object.fromEntries(step.positions.map(p => [p.id, p.position]))
    const next = nodesRef.current.map(n => (byId[n.id] ? { ...n, position: { ...byId[n.id] } } : n))
    setNodes(next)
    if (canAI && activeDiagram?.id) savePositions(activeDiagram.id, next)
    if (step.pins) restorePins(step.pins)
    if (refit) setTimeout(() => rfInstance.current?.fitView({ padding: 0.15, duration: 400 }), 60)
  }, [canAI, activeDiagram, savePositions, restorePins])

  // Where the canvas stands right now, so undo can hand it to redo.
  const snapshot = kind => ({ positions: positionsOf(nodesRef.current), pins: pinsOf(edgesRef.current), kind })

  const undo = useCallback(() => {
    const { past, future } = historyRef.current
    if (!past.length) return
    const step = past[past.length - 1]
    setHistory({ past: past.slice(0, -1), future: [...future, snapshot(step.kind)] })
    applySnapshot(step, step.kind === 'arrange')
  }, [applySnapshot])

  const redo = useCallback(() => {
    const { past, future } = historyRef.current
    if (!future.length) return
    const step = future[future.length - 1]
    setHistory({ past: [...past, snapshot(step.kind)], future: future.slice(0, -1) })
    applySnapshot(step, step.kind === 'arrange')
  }, [applySnapshot])

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

  // Auto-arrange: 2 styles, rows (dagre - start on the left, spread out, steps
  // ordered top-to-bottom, labels clear of nodes) and fan (layoutFan.js - a
  // tree that fans out from the start node). Either way: fit-zoom, and persist
  // for the owner so the tidy layout sticks.
  const autoArrange = useCallback((style = 'fan') => {
    const current = nodesRef.current
    const flow = current.filter(n => n.type === 'awsNode')
    const arranged = style === 'fan' ? layoutFanOut(flow, edges) : layoutElements(flow, edges, { canvas: canvasSize() })
    pushHistory(positionsOf(current), 'arrange')
    setNodes(arranged)
    if (canAI && activeDiagram?.id) savePositions(activeDiagram.id, arranged)
    // Arrange is a reset to automatic - a Start pill the owner placed by hand
    // no longer means anything once the layout underneath it has moved.
    if (canAI && activeDiagram?.view_state?.start) {
      const prev = activeDiagram.view_state
      patchViewState({
        ...(prev.panels ? { panels: prev.panels } : {}),
        ...(prev.badge ? { badge: prev.badge } : {}),
        ...(prev.lanes ? { lanes: prev.lanes } : {}),
      })
    }
    setTimeout(() => rfInstance.current?.fitView({ padding: 0.15, duration: 400 }), 60)
  }, [edges, canAI, activeDiagram, savePositions, patchViewState, pushHistory])

  // Let nodes be dragged around the canvas (positions live in React state, and
  // are saved to the DB on drag-end when the owner can edit).
  // Edges are controlled, so a click only selects one if the change is applied
  // here. Selection and removal are taken, nothing else: a remove is the Delete
  // key on a selected line, and it has to reach the row as well as the canvas -
  // a line that comes back on the next reload was never deleted.
  const onEdgesChange = useCallback(changes => {
    const take = changes.filter(c => c.type === 'select' || (c.type === 'remove' && canAI))
    if (!take.length) return
    setEdges(eds => applyEdgeChanges(take, eds))
    const gone = take.filter(c => c.type === 'remove').map(c => c.id)
    if (!gone.length || !activeId) return
    // Filtered by id, never replaced wholesale: the same rule the server uses.
    const drop = eds => (eds || []).filter((e, i) => !gone.includes(e.id || `e${i}`))
    setActiveDiagram(a => (a ? { ...a, data: { ...a.data, edges: drop(a.data.edges) } } : a))
    setDiagrams(ds => ds.map(d => (d.id !== activeId ? d : { ...d, data: { ...d.data, edges: drop(d.data.edges) } })))
    fetch(`/api/flows/${activeId}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deleteEdges: gone }),
    })
      .then(r => showToastMsg(r.ok ? (gone.length > 1 ? `${gone.length} lines deleted` : 'Line deleted') : 'Could not delete (owner only)'))
      .catch(() => showToastMsg('Could not delete'))
  }, [canAI, activeId, showToastMsg])

  const onNodesChange = useCallback(
    changes => {
      // The Start pill's own drag never touches node state - its id is not in
      // `nodes`, so applyNodeChanges would just drop the change. Instead the
      // live position is tracked while dragging and saved to view_state on
      // release, and it is stripped out here so nothing downstream sees it.
      const startChanges = changes.filter(c => c.type === 'position' && c.position && typeof c.id === 'string' && c.id.startsWith('__start_'))
      if (startChanges.length) {
        changes = changes.filter(c => !startChanges.includes(c))
        for (const c of startChanges) {
          if (c.dragging === false) saveStart(c.position)
          else setStartDrag(c.position)
        }
      }
      // A moving card suggests where it wants to land: the closest shared edge
      // or centre line, and failing that the gap the rest of the map already
      // uses. Hold Cmd/Ctrl/Shift to suspend it and place the card by hand.
      // Rewriting the CHANGE (not the node afterwards) is what makes the snap
      // stick on release: React Flow's own drag position never lands in state.
      let applied = changes
      const drags = changes.filter(c => c.type === 'position' && c.position)
      const drag = drags[0]
      // Only a single-node drag snaps. Rewriting one position out of a multi-node
      // drag would shear the selection apart.
      if (drag && drags.length === 1 && !snapModRef.current) {
        const all = rfInstance.current?.getNodes() ?? []
        const dragged = all.find(n => n.id === drag.id)
        // Only real service nodes are snap targets - the Start pill is derived
        // unless the owner has placed it, and even then it moves by its own
        // save path above, not by snapping against the other cards.
        const targets = all.filter(n => n.type === 'awsNode')
        if (dragged) {
          const { position, guides } = snapSuggest({ ...dragged, position: drag.position }, targets)
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
    [canAI, activeDiagram, savePositions, pushHistory, saveStart],
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
        // A link opens straight onto the canvas, so the flow plays on its own:
        // whoever it was shared with should see it move, not hunt for Play.
        flowClock.setPlaying(true)
        setLoadingId(false)
      })
      .catch(failedLoad)
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
        flowClock.setPlaying(true) // same as ?id=: a shared link plays itself
        setLoadingId(false)
      })
      .catch(failedLoad)
    // Resolves the URL once on mount. openDiagram is stable for that purpose and
    // listing it would re-run the fetch on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Back and Forward. The URL is the source of truth for which view is up: no
  // ?name= and no ?id= is the list, anything else is a flow, resolved the same
  // way a cold load resolves it. Without this the address bar would change
  // under a view that never re-rendered.
  useEffect(() => {
    const onPop = () => {
      const q = new URLSearchParams(window.location.search)
      const key = q.get('name') || q.get('id')
      if (!key) return backToGallery()
      setLoadingId(true)
      fetch(`/api/flows/${encodeURIComponent(key)}`)
        .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then(row => { openDiagram(rowToDiagram(row)); setLoadingId(false) })
        .catch(failedLoad)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
    // Same as the two loaders above: openDiagram is stable for this purpose and
    // listing it would re-subscribe on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The gallery tile is a capture of this very canvas, taken a beat after the
  // owner opens a flow or changes anything on it. It rides its own tiny PATCH.
  // Keyed on the SAVED diagram, not on the live node state: that array is
  // rebuilt every frame while the canvas animates, and a debounce on it never
  // settles. Every persisted change lands in activeDiagram, so that is enough.
  const thumbTimer = useRef(null)
  const lastThumb = useRef('')
  useEffect(() => {
    if (view !== 'detail' || !canAI || !activeDiagram?.id) return
    clearTimeout(thumbTimer.current)
    const savingId = activeDiagram.id
    thumbTimer.current = setTimeout(async () => {
      const thumbnail = await makeThumbnail(rfInstance.current?.getNodes?.() || [])
      if (!thumbnail || thumbnail === lastThumb.current) return
      lastThumb.current = thumbnail
      fetch(`/api/flows/${savingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thumbnail }),
      })
        .then(r => (r.ok ? r.json() : null))
        .then(row => { if (row) setDiagrams(ds => ds.map(d => (d.id === savingId ? { ...d, thumbnailAt: row.thumbnail_at } : d))) })
        .catch(() => {})
      // Warm the README GIF for this version of the flow, so the first fetch
      // from GitHub or Confluence is a lookup, not a render.
      fetch(`/api/flows/${savingId}?format=gif`, { cache: 'no-store' }).catch(() => {})
    }, 1500)
    return () => clearTimeout(thumbTimer.current)
  }, [view, canAI, activeDiagram, badgeMode, showNotes])

  // Save the open panel + badge style back to the row, debounced, owner only.
  // Only ONE panel is ever open, so this collapses to a single value rather than
  // four booleans - a shape the API can validate.
  const viewSaveTimer = useRef(null)
  // The save waiting on the debounce, so a GIF export can run it first: the
  // canvas is up to 600 ms ahead of the row, and the export renders the row.
  const viewSavePending = useRef(null)
  const openPanels = [
    showSteps && 'steps', showDetailCode && 'code',
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
    viewSavePending.current = null
    if (prevKey === panelKey && prev.badge === badgeMode) return
    const savingId = activeDiagram.id
    const save = () => {
      viewSavePending.current = null
      // Carry the owner's Start placement through a plain panel/badge save -
      // this effect only ever meant to touch those two, and rebuilding the
      // object from scratch would otherwise silently clear the placement.
      const view_state = { panels: panelKey ? panelKey.split(',') : [], badge: badgeMode, ...(prev.start ? { start: prev.start } : {}), ...(prev.lanes ? { lanes: prev.lanes } : {}), ...(prev.current ? { current: prev.current } : {}) }
      return fetch(`/api/flows/${savingId}`, {
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
    }
    viewSavePending.current = save
    viewSaveTimer.current = setTimeout(save, 600)
    return () => clearTimeout(viewSaveTimer.current)
  }, [view, canAI, activeDiagram, panelKey, badgeMode])

  // The flow fetches reject with Error('HTTP <status>'); anything else is the
  // network, and the closed-flow page tells the 2 apart.
  function failedLoad(err) {
    const m = /^HTTP (\d+)$/.exec(err?.message || '')
    setLoadError(m ? Number(m[1]) : 'network')
    setLoadingId(false)
  }

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

  // My Diagrams and Linked split the owner's own rows on the "linked" tag: a
  // diagram made for a repo (README, PR, audit) lists under Linked only, so
  // the daily list is the owner's own work. The demo roster is neither.
  const showcase = isDemo || galleryTab === 'demos'
  const own = diagrams.filter(d => showcase || (d.tags || []).includes('linked') === (galleryTab === 'linked'))
  const filtered = own.filter(d => !search.trim() || d.title.toLowerCase().includes(search.toLowerCase()))

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
      <ClosedFlowScreen status={loadError} signedIn={Boolean(user) || IS_DEV}
        flowId={new URLSearchParams(window.location.search).get('id')} onBack={backToGallery} />
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
        user={user} canAI={canAI} isDemo={isDemo} listError={listError} listLoading={listLoading}
        galleryTab={galleryTab} setGalleryTab={setGalleryTab}
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

  // The link every share path hands out: the unique ?id= URL on the public
  // origin. A diagram with no slug (unsaved, AI-generated, pasted) has no public
  // URL, so it falls back to whatever is in the address bar.
  const shareSlug = (activeDiagram?.id && activeDiagram?.slug) || ''
  // Always /demo, never "/". Vercel applies rewrites AFTER the filesystem check,
  // and "/" resolves to the static index.html - so the share function never runs
  // there and a link off the home route previews as the generic site card. /demo
  // is not a file, so it reaches the function and gets this design's own card.
  const shareUrl = shareSlug
    ? `${publicOrigin()}/demo?id=${encodeURIComponent(activeDiagram.id)}`
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
  // A saved flow downloads the server's render (?format=gif): full HD, 100
  // frames at 20 fps, the same renderer as the SVG export, and already warmed
  // at save time. Recording the DOM here managed 20 frames at 1x, which the
  // owner saw as blurry and jerky (2026-10-04). The recorder below stays for
  // a flow with no row to render from.
  async function exportGif() {
    const savedId = activeDiagram?.id && !activeDiagram.sample ? activeDiagram.id : null
    if (savedId) {
      showToastMsg('Rendering HD GIF...')
      try {
        // A notes or Steps toggle saves debounced, so the row can be a beat
        // behind the canvas. Save it now: the export is what is on screen.
        if (viewSavePending.current) { clearTimeout(viewSaveTimer.current); await viewSavePending.current() }
        // A fresh URL every time: the render is cached for an hour by the browser
        // and the CDN (lib/handlers/flow-by-id.js), so a plain fetch could hand
        // back the GIF from BEFORE a notes or Steps toggle. The server still
        // answers from flow_renders, so this costs a lookup, not a render.
        const r = await fetch(`/api/flows/${savedId}?format=gif&t=${Date.now()}`, { cache: 'no-store' })
        if (!r.ok) throw new Error(String(r.status))
        const a = document.createElement('a')
        a.href = URL.createObjectURL(await r.blob())
        a.download = exportFilename('gif'); a.click()
        URL.revokeObjectURL(a.href)
        showToastMsg('GIF saved')
        return
      } catch {
        showToastMsg('Server render failed, recording instead')
      }
    }
    // The dots are pinned and stepped by hand (see flowClock) so the N frames are
    // exactly evenly spaced around one period and the loop closes seamlessly.
    // pixelRatio is 1 and the canvas is capped: a GIF is 256 colours and paletted,
    // so retina pixels buy nothing but megabytes.
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
      const delay = Math.round(clock.capturePeriodMs() / FRAMES)
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
  // A restore overwrites the live diagram (see lib/versions.js), so pull the
  // fresh row and show it exactly as opening the diagram would - same mapping,
  // fit to the screen once it lands. Unlike openDiagram this never touches
  // history, panels or the URL: the canvas just catches up to what the DB
  // now says.
  async function onRestored() {
    if (!activeDiagram?.id) return
    try {
      const r = await fetch(`/api/flows/${activeDiagram.id}`, { credentials: 'include' })
      if (!r.ok) return
      const d = rowToDiagram(await r.json())
      setActiveDiagram(d)
      setDiagrams(ds => ds.map(x => (x.id === d.id ? d : x)))
      const { nodes: n, edges: e } = buildDiagramNodesEdges(d)
      setNodes(n)
      setEdges(e)
      setTimeout(() => rfInstance.current?.fitView({ padding: 0.15, duration: 400 }), 60)
    } catch { /* the History panel still shows the new row even if this fails */ }
  }

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
  // Swimlanes are configuration (view_state.lanes, set over the API or MCP),
  // never edited on the canvas: drawn under the cards, nothing more.
  // A card draws 180 square (NODE_W 190 is layout pitch), so a section's pad is
  // measured off the drawn card, the same on every side.
  const laneCfg = laneDraft || activeDiagram?.view_state?.lanes || []
  const laneCards = nodes.map(n => { const s = sizeOf(n); return { id: n.id, x: n.position?.x ?? 0, y: n.position?.y ?? 0, w: n.data?.size?.w ?? 180, h: s.h + (showNotes ? getNoteHeight(n.id) : 0), color: n.data?.sunset ? null : findService(n.data || { id: n.id })?.color } })
  // The owner drags a band (#468): its title moves it with its cards, an edge
  // sizes it. The drag previews in laneDraft and the card positions; the drop
  // saves the lanes and the cards together.
  const onBand = ({ phase, kind, lane, section, rect, dx, dy }) => {
    const col = laneAxis(laneCfg) === 'col'
    if (phase === 'start') {
      const rects = laneRects(laneCfg, laneCards)
      const bands = section ? sectionRects(rects.find(r => r.id === lane), col ? 'col' : 'row', laneCards) : rects
      const home = {}
      for (const c of laneCards) {
        const cx = c.x + c.w / 2, cy = c.y + c.h / 2
        const b = bands.find(r => cx >= r.x && cx < r.x + r.w && cy >= r.y && cy < r.y + r.h)
        if (b) home[c.id] = b.id
      }
      // What a band edge may snap to: every other band and section, and every card outside it.
      const mine = section || lane
      const targets = [
        ...rects.flatMap(r => (r.sections?.length >= 2 ? sectionRects(r, col ? 'col' : 'row', laneCards) : [r])).filter(r => r.id !== mine),
        ...laneCards.filter(c => home[c.id] !== mine),
      ]
      setSelBand({ lane, section: section || null })
      bandDrag.current = { base: laneCfg, home, targets, from: Object.fromEntries(laneCards.map(c => [c.id, { x: c.x, y: c.y }])) }
      return
    }
    const d = bandDrag.current
    if (!d) return
    // Snap along the band like a card does: the edge that moves latches onto
    // the nearest edge within 10 screen px, and a guide shows the line.
    let guide = null
    if (!col && kind !== 'h' && (dx || dy)) {
      const zoom = rfInstance.current?.getZoom?.() || 1
      const edges = kind === 'w' ? [rect.x + rect.w] : kind === 'l' ? [rect.x] : [rect.x, rect.x + rect.w]
      let best = null
      for (const o of d.targets) for (const b of [o.x, o.x + o.w]) for (const a of edges) {
        const delta = b - (a + dx)
        if (Math.abs(delta) <= 10 / zoom && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, at: b, o }
      }
      if (best) {
        dx += best.delta
        guide = { axis: 'x', at: best.at, from: Math.min(rect.y, best.o.y), to: Math.max(rect.y + rect.h, best.o.y + best.o.h) }
      }
    }
    setSnapGuides(phase === 'end' || !guide ? [] : [guide])
    let next = d.base, moved = null
    if (kind === 'move' && section) {
      const along = col ? 'y' : 'x', dv = col ? dy : dx
      moved = id => (d.home[id] === section ? { ...d.from[id], [along]: d.from[id][along] + dv } : null)
      const starts = {}
      for (const [id, sid] of Object.entries(d.home)) starts[sid] = Math.min(starts[sid] ?? Infinity, (moved(id) || d.from[id])[along])
      next = d.base.map(l => (l.id === lane ? { ...l, sections: resortSections(l.sections, starts) } : l))
    } else if (kind === 'move') {
      // Lanes re-pack on the drop, so every lane's cards follow their band.
      const across = col ? 'x' : 'y', dv = col ? dx : dy, out = moveLane(d.base, lane, dv)
      const by = sid => (phase === 'end' ? out.shift[sid] : sid === lane ? dv : 0)
      // Along the band the lane's cards move with it, and its start and end
      // follow (lead / len); the other lanes hold still even if the shared
      // start moved.
      const along = col ? 'y' : 'x', du = Math.round(col ? dy : dx)
      moved = id => (d.home[id] ? { ...d.from[id], [across]: d.from[id][across] + by(d.home[id]), ...(d.home[id] === lane ? { [along]: d.from[id][along] + du } : {}) } : null)
      const startOf = cards => laneSpan(cards, col ? 'col' : 'row')[along]
      const ds = du ? startOf(laneCards.map(c => (d.home[c.id] === lane ? { ...c, [along]: c[along] + du } : c))) - startOf(laneCards) : 0
      const slide = l => {
        const by = l.id === lane ? du - ds : -ds
        return by ? { ...l, lead: (l.lead || 0) - by, ...(Number.isFinite(l.len) ? { len: l.len + by } : {}) } : l
      }
      next = (phase === 'end' ? out.lanes : d.base.map(l => (l.id === lane ? { ...l, [across]: l[across] + dv } : l))).map(slide)
    } else {
      // 'l' is the leading edge: it adds room before the first card. A size
      // along the band counts from the cards, so it leaves the lead out.
      const own = l => (section ? l.sections.find(s => s.id === section) : l)
      const along = (kind === 'h') === col
      const set = (l, v) => (section ? { ...l, sections: l.sections.map(s => (s.id === section ? { ...s, ...v } : s)) } : { ...l, ...v })
      next = d.base.map(l => {
        if (l.id !== lane) return l
        const lead = own(l).lead || 0
        // Pulled in, the left edge stops at the first card (plain lane) or
        // through the auto pad (section); src/lanes.js holds the same floor.
        if (kind === 'l') {
          const a = col ? 'y' : 'x', mine = laneCards.filter(c => d.home[c.id] === (section || lane)).map(c => c[a])
          const room = mine.length ? Math.min(...mine) - HAND_MIN_PAD - rect[a] : 0
          const from = !section ? laneSpan(laneCards, col ? 'col' : 'row')[a] : mine.length ? Math.min(...mine) - SECTION_PAD : rect[a] + lead
          return set(l, { lead: Math.round(from - rect[a] - Math.min(col ? dy : dx, room)) })
        }
        let size = Math.max(LANE_MIN, Math.round(rect[kind] + (kind === 'w' ? dx : dy) - (along ? lead : 0)))
        // A section grows inside its row, never into the next lane.
        if (section && !along) {
          const a = col ? 'x' : 'y', next = laneRects(d.base, laneCards).map(r => r[a]).filter(v => v > rect[a])
          if (next.length) size = Math.min(size, Math.min(...next) - LANE_GAP - rect[a])
        }
        return set(l, { [section ? kind : along ? 'len' : 'depth']: size })
      })
      // A thicker or thinner plain lane re-packs the lanes after it: their cards follow.
      if (!section) {
        const across = col ? 'x' : 'y', packed = cleanLanes(next)
        const by = Object.fromEntries(packed.map(l => [l.id, l[across] - d.base.find(b => b.id === l.id)[across]]))
        moved = id => (by[d.home[id]] ? { ...d.from[id], [across]: d.from[id][across] + by[d.home[id]] } : null)
        next = packed
      }
    }
    const still = phase === 'end' && !dx && !dy
    if (moved && !still) setNodes(nds => {
      const nx = nds.map(n => { const p = moved(n.id); return p ? { ...n, position: p } : n })
      if (phase === 'end') savePositions(activeDiagram.id, nx)
      return nx
    })
    if (phase !== 'end') { setLaneDraft(next); return }
    bandDrag.current = null
    setLaneDraft(null)
    if (still) return
    const clean = cleanLanes(next)
    setActiveDiagram(a => (a ? { ...a, view_state: { ...a.view_state, lanes: clean } } : a))
    patchViewState({ ...otherView(['lanes']), lanes: clean })
  }
  const lanes = laneNodes(laneCfg, laneCards)
  // The grips ride a see-through copy of each band above the lines and cards,
  // so a line crossing a title or an edge never takes the drag.
  // While a line is selected the line owns the pointer: its end and bend dots
  // may sit under a band's title or edge, so the grips step aside.
  const laneGrips = canAI && activeDiagram?.id && !activeDiagram.editLocked && !edges.some(e => e.selected)
    ? lanes.map(l => ({ ...l, id: `__grip_${l.data.laneId}`, type: 'laneGrips', zIndex: 1000, data: { ...l.data, onBand, picked: selBand?.lane === l.data.laneId ? (selBand.section || '__lane') : null } }))
    : []
  // Swimlanes already say where a flow begins (the top lane), so a diagram
  // with lanes draws no Start here pill. Same rule in render-svg.js.
  const markers = lanes.length ? { nodes: [], edges: [] } : buildMarkers(nodes, edges, startDrag || activeDiagram?.view_state?.start, canAI)
  const displayNodes = [...lanes, ...nodes, ...markers.nodes, ...laneGrips]
  const displayEdges = [...edges, ...markers.edges]
  return (
    <DetailView
      toast={toast} showToastMsg={showToastMsg}
      onBack={backToGallery}
      showDetailCode={showDetailCode} setShowDetailCode={setShowDetailCode}
      rfInstance={rfInstance} flashZoomHud={flashZoomHud} zoomHudRef={zoomHudRef}
      showSharePanel={showSharePanel} setShowSharePanel={setShowSharePanel}
      showHistoryPanel={showHistoryPanel} setShowHistoryPanel={setShowHistoryPanel}
      onRestored={canAI && activeDiagram?.id ? onRestored : undefined}
      showSteps={showSteps} setShowSteps={setShowSteps}
      showNotes={showNotes} setShowNotes={setShowNotes}
      isLocked={!!activeDiagram?.locked} isEditLocked={!!activeDiagram?.editLocked} onSetLocks={canAI ? setLocks : undefined}
      badgeMode={badgeMode} setBadgeMode={setBadgeMode}
      activeDiagram={activeDiagram}
      detailCodeCopied={detailCodeCopied} setDetailCodeCopied={setDetailCodeCopied}
      nodes={displayNodes} edges={displayEdges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
      onNodeDragStop={onNodeDragStop} snapGuides={snapGuides} onPaneTap={() => setSelBand(null)}
      canUndo={history.past.length > 0} canRedo={history.future.length > 0} onUndo={undo} onRedo={redo}
      shareSlug={shareSlug} shareUrl={shareUrl}
      onDeleteDiagram={canAI && activeDiagram?.id ? () => deleteDiagram(activeDiagram.id, { thenBack: true }) : undefined}
      exportPng={exportPng} exportWebp={exportWebp} exportGif={exportGif} exportCode={exportCode} exportJson={exportJson}
      copyLink={copyLink} copiedLink={copiedLink}
      shareAction={shareAction} copiedShare={copiedShare}
      copyCode={copyCode} copiedCode={copiedCode}
      showDocs={showDocs} setShowDocs={setShowDocs}
      copiedLabel={copiedLabel} onCopyFormat={copyFormat}
      isPublic={isDemo}
      saveState={saveState}
      onArrange={autoArrange}
      onNoteChange={canAI ? onNoteChange : undefined}
      onEdgeStyleChange={canAI ? onEdgeStyleChange : undefined}
      onNodeResize={canAI ? onNodeResize : undefined}
      onIconResize={canAI ? onIconResize : undefined}
      isDiagramPublic={activeDiagram?.is_public !== false}
      canEdit={canAI}
      onToggleVisibility={canAI && activeDiagram?.id ? toggleVisibility : undefined}
      onShareOpen={canAI && activeDiagram?.id ? ensureShareable : undefined}
      current={current} onCurrentChange={canAI && activeDiagram?.id ? setCurrent : undefined}
      sizing={sizing} onSizingChange={canAI && activeDiagram?.id ? setSizing : undefined}
    />
  )
}
