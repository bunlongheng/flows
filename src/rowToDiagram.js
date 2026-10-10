// The ONE mapping from an API row to a gallery item. It was hand-copied in 3
// places and had already drifted (difficulty missing on the ?id= path).
export function rowToDiagram(r) {
  return {
    id: r.id,
    slug: r.slug || '',
    view_state: r.view_state || null,
    is_public: r.is_public,
    // A locked diagram is one a README links to. The flag has to survive this
    // mapping or the toolbar shows an unlocked padlock over a row the server
    // will refuse to delete.
    locked: !!r.locked,
    editLocked: !!r.edit_locked,
    title: r.title,
    description: r.description || '',
    pattern: r.pattern || '',
    difficulty: r.difficulty ?? null,
    data: { nodes: r.nodes, edges: r.edges },
    // The tile URL is versioned on both: a new capture, or a content change
    // that dropped the old one, each mean a new picture.
    thumbnailAt: r.thumbnail_at || null,
    changedAt: r.updated_at || null,
    updatedAt: r.updated_at || r.created_at,
    tags: r.tags || [],
  }
}
