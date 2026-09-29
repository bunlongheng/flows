import { createContext } from 'react'

// The owner's note editor, handed to every node through React Flow's tree. The
// value is (nodeId, note) => void when signed in, and null on a shared /demo
// link or while signed out - a node with no handler renders its note read-only.
export const NoteEditContext = createContext(null)

// The owner's info editor: (nodeId, info) => void when signed in, null
// otherwise. Info is what a thing is and why it is in this diagram, hidden
// behind the i badge on the card until the reader hovers or clicks it.
export const InfoEditContext = createContext(null)

// The owner's node resize handler, handed to every node the same way. The
// value is (nodeId, { w, h }) => void when signed in, and null on a shared
// /demo link or while signed out - a node with no handler renders no resizer.
export const NodeResizeContext = createContext(null)

// The owner's icon/photo resize handler, handed to every node the same way as
// NodeResizeContext but for the image INSIDE the card rather than the card
// itself. The value is (nodeId, iconSize | null) => void when signed in, and
// null on a shared /demo link or while signed out.
export const IconResizeContext = createContext(null)

// Whether node notes are drawn at all. A dense diagram with a caption under
// every box is a wall of text when you only want to see the shape of it, so the
// toolbar can turn them off. Defaults to true: a diagram that has never been
// toggled keeps showing the notes its author wrote, and a shared link is not
// silently stripped of the explanations that came with it.
export const ShowNotesContext = createContext(true)

// ─── Measured note heights ────────────────────────────────────────────────────
// A note hangs BELOW the card (position: absolute, top: 100%), so React Flow
// never measures it: as far as the edge router is concerned the node stops at
// the card, and a line leaving the bottom face runs straight under the note box
// and disappears behind it. The box is opaque, so the connection just looks
// broken.
//
// The router already avoids every other card (GradientEdge's obstacle list), so
// the note only has to be part of the same box for lines to route around it.
// Its height depends on how the text wraps, which is a DOM fact - hence a
// measurement published from the node and read by the edges.
const heights = new Map()
const listeners = new Set()

export function setNoteHeight(id, h) {
  const next = Math.max(0, Math.round(h || 0))
  if (heights.get(id) === next) return
  if (next) heights.set(id, next); else heights.delete(id)
  for (const fn of listeners) fn()
}

export const getNoteHeight = (id) => heights.get(id) || 0

// useSyncExternalStore needs a stable snapshot, so this is a version counter
// rather than the Map itself.
let version = 0
export function subscribeNoteHeights(fn) {
  const bump = () => { version += 1; fn() }
  listeners.add(bump)
  return () => listeners.delete(bump)
}
export const noteHeightsVersion = () => version
