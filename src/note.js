// A node note is plain text under the card: what this step does, why it is
// there, or what changes. Trimmed and bounded so a shared row stays small.
// '' means "no note" everywhere - the key is dropped rather than stored empty.
export const NOTE_MAX = 400
export const cleanNote = v => (typeof v === 'string' ? v.trim().slice(0, NOTE_MAX) : '')

// A node info is plain text hidden until the reader hovers or clicks the i
// badge: what this thing is and why it exists in this diagram, in 1-3 sentences.
// '' means "no info" everywhere - the key is dropped rather than stored empty.
export const INFO_MAX = 600
export const cleanInfo = v => (typeof v === 'string' ? v.trim().slice(0, INFO_MAX) : '')
