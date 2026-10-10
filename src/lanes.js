// Swimlanes: bands the cards sit in, 1 per layer of the system (VISITOR,
// APPS, RELAY, INBOX). Optional, per diagram, configuration only: saved in
// view_state.lanes over the API (PATCH view_state { lanes }) or the MCP
// (update_flow lanes), never edited on the canvas. A lane is a row
// { id, title, y, h, color?, size? } for a top-down layout or a column
// { id, title, x, w, color?, size? } for a left-to-right one; size is the
// title in px (default LANE_TITLE); a diagram has 1 kind,
// the kind of its first lane. A lane spans the whole diagram on its other
// axis, so cards fit by where they stand. The canvas and every export draw
// lanes from this 1 file so they match.

import { isNeutralColor } from './iconColor.js'

export const LANE_PAD = 100 // past the outermost card on each side
export const LANE_MIN = 80 // the thinnest lane
export const LANE_GAP = 40 // the 1 gap between lanes, always the same
export const LANE_MAX = 12
export const LANE_FIT = 36 // past the last card (and its note) inside a lane
export const LANE_INK = '#64748b'
export const LANE_TITLE = 13 // title size in px unless the lane says otherwise
export const LANE_TITLE_MIN = 10
export const LANE_TITLE_MAX = 40
export const LANE_SECTIONS_MAX = 8

// An edge end may name a lane instead of a card: "lane:<id>". The line stops on
// the lane's border and reads as 1 line to every card inside it. On the canvas
// the lane is the React Flow node laneNodeId(id); the API and exports keep the
// "lane:" form.
export const laneRef = id => (typeof id === 'string' && id.startsWith('lane:') ? id.slice(5) : null)
export const laneNodeId = id => `__lane_${id}`
export const isLaneNode = id => typeof id === 'string' && id.startsWith('__lane_')

// 'row' lanes stack by y and h; 'col' lanes stand side by side by x and w.
export const laneAxis = lanes => (lanes[0] && 'x' in lanes[0] ? 'col' : 'row')

// A lane can be split into 2 to 8 sections side by side ACROSS its own band:
// the row stays 1 row, and each section is a band of its own inside it, with
// its own title and tint and the same LANE_GAP between them that separates 2
// stacked lanes. `at` is where a section starts on the lane's other axis (x in
// a row lane, y in a column one); the first always starts at the band's own
// edge, so only the later ones really matter. 1 section is not a split, so it
// is dropped and the lane draws its own band and title as before.
// A size the owner dragged on the canvas (section w / h, a plain lane's len
// along its band). It wins over the auto fit, but never cuts a card: the draw
// grows it back to the cards plus HAND_MIN_PAD.
export const HAND_MIN_PAD = 8
const handLead = v => (Number.isFinite(v) ? Math.min(20000, Math.max(0, Math.round(v))) : 0)
// A section's left edge may also pull in through its auto pad, down to HAND_MIN_PAD.
const SECTION_LEAD_MIN = -24
const handSize = v => Math.min(20000, Math.max(LANE_MIN, Math.round(v)))
function cleanSections(raw) {
  if (!Array.isArray(raw)) return null
  const out = []
  for (const s of raw) {
    if (!s || typeof s !== 'object' || out.length >= LANE_SECTIONS_MAX) continue
    const id = typeof s.id === 'string' && /^[\w-]{1,40}$/.test(s.id) ? s.id : null
    if (!id || out.some(o => o.id === id) || !Number.isFinite(s.at)) continue
    const sec = { id, title: String(s.title ?? '').trim().slice(0, 40), at: Math.round(s.at) }
    if (typeof s.color === 'string' && /^#[0-9a-f]{6}$/i.test(s.color)) sec.color = s.color
    for (const k of ['w', 'h']) if (Number.isFinite(s[k])) sec[k] = handSize(s[k])
    if (Number.isFinite(s.lead) && Math.round(s.lead)) sec.lead = Math.min(20000, Math.max(SECTION_LEAD_MIN, Math.round(s.lead)))
    out.push(sec)
  }
  return out.length >= 2 ? out.sort((a, b) => a.at - b.at) : null
}

// Where a laid-out lane's sections are drawn, in canvas units. `at` says which
// cards belong to a section: those whose centre sits from its `at` up to the
// next one's (an `at` outside the band is pulled back inside it). A section
// then hugs its own cards with the same SECTION_PAD on all 4 sides, the title
// sitting inside the top pad (owner 2026-10-10: "this padding MUST be same",
// and the lane may stay empty around sections), so a section is only as big
// as what it holds. A section with no
// cards keeps the span its `at` gives it: from the band's edge or its `at`, to
// LANE_GAP short of the next one or the band's far edge.
export const SECTION_PAD = 32
export function sectionRects(rect, axis = 'row', cards = []) {
  const secs = rect.sections || []
  if (secs.length < 2) return []
  const [at, size, across, deep] = axis === 'col' ? ['y', 'h', 'x', 'w'] : ['x', 'w', 'y', 'h']
  const lo = rect[at], hi = rect[at] + rect[size]
  const cuts = secs.map((s, i) => (i === 0 ? lo : Math.min(hi, Math.max(lo, s.at))))
  for (let i = 1; i < cuts.length; i++) if (cuts[i] < cuts[i - 1]) cuts[i] = cuts[i - 1]
  const inBand = cards.filter(c => c[across] >= rect[across] && c[across] < rect[across] + rect[deep])
  return secs.map((s, i) => {
    const next = i + 1 < cuts.length ? cuts[i + 1] : Infinity
    const mine = inBand.filter(c => c[at] + c[size] / 2 >= (i === 0 ? -Infinity : cuts[i]) && c[at] + c[size] / 2 < next)
    // A hand lead (its left / top edge) adds room before the first card; the
    // far edge stays where it was, so a hand size counts from the cards.
    const base = mine.length ? Math.min(...mine.map(c => c[at])) - SECTION_PAD : cuts[i]
    const start = base - Math.max(SECTION_LEAD_MIN, s.lead || 0)
    const far = mine.length ? Math.max(...mine.map(c => c[at] + c[size])) : start
    const top = mine.length ? Math.min(...mine.map(c => c[across])) - SECTION_PAD : rect[across]
    const low = mine.length ? Math.max(...mine.map(c => c[across] + c[deep])) : top
    const fit = (hand, from, edge, auto) => (Number.isFinite(hand) ? from + Math.max(hand, edge - from + HAND_MIN_PAD) : auto)
    const end = fit(s[size], base, far, mine.length ? far + SECTION_PAD : (next === Infinity ? hi : next - LANE_GAP))
    const bottom = fit(s[deep], top, low, mine.length ? low + SECTION_PAD : rect[across] + rect[deep])
    return {
      id: s.id, title: s.title, size: rect.size,
      color: s.color || cardsColor(mine) || rect.color,
      [across]: top, [deep]: bottom - top,
      [at]: start, [size]: Math.max(0, end - start),
    }
  })
}

// What the API keeps of a lanes array: bounded, typed, 1 axis, nothing else.
export function cleanLanes(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  let axis = null
  for (const l of raw) {
    if (!l || typeof l !== 'object' || out.length >= LANE_MAX) continue
    const id = typeof l.id === 'string' && /^[\w-]{1,40}$/.test(l.id) ? l.id : null
    if (!id || out.some(o => o.id === id)) continue
    const kind = Number.isFinite(l.x) && Number.isFinite(l.w) ? 'col' : Number.isFinite(l.y) && Number.isFinite(l.h) ? 'row' : null
    if (!kind || (axis && kind !== axis)) continue
    axis = kind
    const lane = { id, title: String(l.title ?? '').trim().slice(0, 40) }
    if (kind === 'col') { lane.x = Math.round(l.x); lane.w = Math.max(LANE_MIN, Math.round(l.w)) }
    else { lane.y = Math.round(l.y); lane.h = Math.max(LANE_MIN, Math.round(l.h)) }
    if (typeof l.color === 'string' && /^#[0-9a-f]{6}$/i.test(l.color)) lane.color = l.color
    if (Number.isFinite(l.size)) lane.size = Math.min(LANE_TITLE_MAX, Math.max(LANE_TITLE_MIN, Math.round(l.size)))
    if (Number.isFinite(l.len)) lane.len = handSize(l.len)
    // A plain lane may also start later than the shared start (moved right).
    if (Number.isFinite(l.lead) && Math.round(l.lead)) lane.lead = Math.min(20000, Math.max(-20000, Math.round(l.lead)))
    if (handLead(l.gap)) lane.gap = handLead(l.gap)
    // A hand thickness (the bottom / right edge of a plain lane) is also the
    // configured size, so the stack packs around what the owner sees.
    if (Number.isFinite(l.depth)) lane[kind === 'col' ? 'w' : 'h'] = lane.depth = handSize(l.depth)
    const sections = cleanSections(l.sections)
    if (sections) lane.sections = sections
    out.push(lane)
  }
  return packLanes(out)
}

// Lanes are a stack along their axis: the first where it was configured, each
// next one LANE_GAP after the one before, so the gaps are always equal
// whatever positions come in.
export function packLanes(lanes) {
  const [at, size] = laneAxis(lanes) === 'col' ? ['x', 'w'] : ['y', 'h']
  const sorted = [...lanes].sort((a, b) => a[at] - b[at])
  // A hand `gap` is extra room the owner left before a lane by dropping it there.
  let pos = sorted.length ? sorted[0][at] - (sorted[0].gap || 0) : 0
  return sorted.map(l => { const out = { ...l, [at]: pos + (l.gap || 0) }; pos = out[at] + l[size] + LANE_GAP; return out })
}

// The reach shared by every lane on its other axis: the cards' extent plus padding.
export function laneSpan(rects, axis = 'row') {
  const [at, size] = axis === 'col' ? ['y', 'h'] : ['x', 'w']
  if (!rects.length) return { [at]: -LANE_PAD, [size]: 2 * LANE_PAD }
  const lo = Math.min(...rects.map(r => r[at])), hi = Math.max(...rects.map(r => r[at] + r[size]))
  return { [at]: lo - LANE_PAD, [size]: hi - lo + 2 * LANE_PAD }
}

// Where each lane is drawn: { id, title, color, size, x, y, w, h } in canvas units.
// A lane's thickness follows its cards: the band ends LANE_FIT past the last
// card inside it, note included while notes are shown, so hiding the notes
// tightens every band and showing them opens it back up. The configured h (or
// w) says which band a card starts in and holds for an empty lane; a band
// never grows across the next one.
export function fitLanes(lanes, rects) {
  const [at, size] = laneAxis(lanes) === 'col' ? ['x', 'w'] : ['y', 'h']
  const starts = lanes.map(l => l[at]).sort((a, b) => a - b)
  return lanes.map(l => {
    const inside = rects.filter(r => r[at] >= l[at] && r[at] < l[at] + l[size])
    if (!inside.length) return l
    const last = Math.max(...inside.map(r => r[at] + r[size]))
    const end = Number.isFinite(l.depth) ? l[at] + Math.max(l.depth, last - l[at] + HAND_MIN_PAD) : last + LANE_FIT
    const next = starts.find(s => s > l[at])
    const cap = next === undefined ? Infinity : next - LANE_GAP - l[at]
    return { ...l, [size]: Math.max(LANE_MIN, Math.min(cap, end - l[at])) }
  })
}

// The primary colour of a band's cards, for a lane or section that names none
// (owner 2026-10-10: a band of LaunchKit and AirClips reads blue-purple). The
// HUE is averaged, not the RGB: mixing RGB turns purple and red into brown. A
// black or grey logo says nothing and is left out; cards whose hues point every
// way have no primary, and the band keeps the lane's colour or the house ink.
const hsl = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn
  const h = d === 0 ? 0 : mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: h * 60, s: d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)), l }
}
const hex = ({ h, s, l }) => {
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l)
  return '#' + [0, 8, 4].map(n => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)))).toString(16).padStart(2, '0')).join('')
}
export function cardsColor(cards) {
  const cs = cards.map(c => c.color).filter(c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) && !isNeutralColor(c)).map(hsl)
  if (!cs.length) return null
  const x = cs.reduce((t, c) => t + Math.cos(c.h * Math.PI / 180), 0) / cs.length
  const y = cs.reduce((t, c) => t + Math.sin(c.h * Math.PI / 180), 0) / cs.length
  if (Math.hypot(x, y) < 0.35) return null
  const mean = k => cs.reduce((t, c) => t + c[k], 0) / cs.length
  return hex({ h: (Math.atan2(y, x) * 180 / Math.PI + 360) % 360, s: Math.max(0.5, mean('s')), l: Math.min(0.65, Math.max(0.35, mean('l'))) })
}

export function laneRects(lanes, rects) {
  const axis = laneAxis(lanes), span = laneSpan(rects, axis)
  const [at, size] = axis === 'col' ? ['x', 'w'] : ['y', 'h']
  // A hand len shortens (or stretches) a plain lane along its band, from the
  // shared start, never past its own cards.
  const [along, long] = axis === 'col' ? ['y', 'h'] : ['x', 'w']
  const lenOf = (l, cards) => (Number.isFinite(l.len)
    ? { [long]: Math.max(l.len, Math.max(span[along], ...cards.map(c => c[along] + c[long])) - span[along] + HAND_MIN_PAD) }
    : {})
  // A hand lead pulls the start back by that much, the far end stays put.
  // A negative lead pulls the start in, never past the lane's own first card.
  const leadOf = (l, box, cards) => {
    const lead = cards.length ? Math.max(l.lead || 0, span[along] + HAND_MIN_PAD - Math.min(...cards.map(c => c[along]))) : Math.max(0, l.lead || 0)
    return lead ? { [along]: box[along] - lead, [long]: box[long] + lead } : box
  }
  return fitLanes(lanes, rects).map(l => ({ l, cards: rects.filter(r => r[at] >= l[at] && r[at] < l[at] + l[size]) })).map(({ l, cards }) => ({ id: l.id, title: l.title, color: l.color || cardsColor(cards) || undefined, size: l.size, ...(l.sections ? { sections: l.sections } : {}), ...('x' in l ? { x: l.x, w: l.w } : { y: l.y, h: l.h }), ...leadOf(l, { ...span, ...lenOf(l, cards) }, cards) }))
}

// The React Flow nodes that draw the lanes: 1 per lane, under the cards,
// never selectable or draggable.
export function laneNodes(lanes, rects) {
  const axis = laneAxis(lanes)
  return laneRects(lanes, rects).map(r => ({
    id: laneNodeId(r.id), type: 'lane', position: { x: r.x, y: r.y }, width: r.w, height: r.h, measured: { width: r.w, height: r.h },
    zIndex: -1, selectable: false, draggable: false,
    // Sections come through in the band's own coordinates: the node is already
    // placed at r.x,r.y, so LaneNode lays them out inside it.
    data: { laneId: r.id, title: r.title, color: r.color, size: r.size, axis,
      sections: sectionRects(r, axis, rects).map(s => ({ id: s.id, title: s.title, color: s.color, x: s.x - r.x, y: s.y - r.y, w: s.w, h: s.h })) },
  }))
}

// The clear strips between lanes, where a trunk's bus line can run without
// crossing a lane: the axis the lanes are packed on and the centre of each gap.
export function laneGaps(rects) {
  if (rects.length < 2) return null
  const axis = rects.every(r => r.y === rects[0].y) ? 'x' : 'y'
  const len = axis === 'x' ? 'w' : 'h'
  const sorted = [...rects].sort((a, b) => a[axis] - b[axis])
  const mids = []
  for (let i = 1; i < sorted.length; i++) {
    const lo = sorted[i - 1][axis] + sorted[i - 1][len], hi = sorted[i][axis]
    if (hi > lo) mids.push((lo + hi) / 2)
  }
  return { axis, mids }
}

// The owner drags bands on the canvas (issue #468). A section slides along its
// lane: once its cards have moved, the sections re-sort by where their cards
// now start and every cut sits SECTION_PAD before its own first card, so a
// section dragged past another swaps places. `starts` maps a section id to
// the near edge of its cards; a section with none keeps its `at`.
export function resortSections(sections, starts) {
  const key = s => (Number.isFinite(starts[s.id]) ? starts[s.id] - SECTION_PAD : s.at)
  return sections.map(s => ({ ...s, at: Math.round(key(s)) })).sort((a, b) => a.at - b.at)
}

// A plain lane dragged across its stack: it takes its new place, the stack
// re-packs with even gaps, and each lane says how far its band moved so its
// cards can follow it.
export function moveLane(lanes, id, delta) {
  const at = laneAxis(lanes) === 'col' ? 'x' : 'y'
  const size = at === 'x' ? 'w' : 'h'
  const was = Object.fromEntries(lanes.map(l => [l.id, l[at]]))
  // The stack keeps its top where it was, whichever lane now leads it, and
  // the moved lane stays where it was dropped: the room it leaves before it
  // becomes its `gap`. Dropped past the middle of a neighbour, it swaps.
  const top = Math.min(...lanes.map(l => l[at] - (l.gap || 0)))
  const pack = ls => {
    let pos = top
    return [...ls].sort((a, b) => a[at] - b[at]).map(l => { const v = pos + (l.gap || 0); pos = v + l[size] + LANE_GAP; return { ...l, [at]: v } })
  }
  const moved = lanes.map(l => (l.id === id ? { ...l, [at]: l[at] + delta, gap: 0 } : l))
  let packed = pack(moved)
  const want = was[id] + delta, got = packed.find(l => l.id === id)[at]
  if (want > got) packed = pack(moved.map(l => (l.id === id ? { ...l, gap: Math.round(want - got) } : l)))
  return { lanes: packed, shift: Object.fromEntries(packed.map(l => [l.id, l[at] - was[l.id]])) }
}
