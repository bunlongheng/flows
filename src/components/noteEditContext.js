import { createContext } from 'react'

// The owner's note editor, handed to every node through React Flow's tree. The
// value is (nodeId, note) => void when signed in, and null on a shared /demo
// link or while signed out - a node with no handler renders its note read-only.
export const NoteEditContext = createContext(null)

// Whether node notes are drawn at all. A dense diagram with a caption under
// every box is a wall of text when you only want to see the shape of it, so the
// toolbar can turn them off. Defaults to true: a diagram that has never been
// toggled keeps showing the notes its author wrote, and a shared link is not
// silently stripped of the explanations that came with it.
export const ShowNotesContext = createContext(true)
