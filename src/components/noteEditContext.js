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
