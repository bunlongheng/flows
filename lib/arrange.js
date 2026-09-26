import { layoutElements } from "../src/layout.js";

// The same layout the Arrange button runs, so a diagram is BORN looking the way
// it would after you pressed it.
//
// It replaces a 6-column grid that was fabricated by ARRAY INDEX at 220x160
// spacing: tight enough that edge labels landed on top of boxes, and blind to
// the flow, so step 1 could sit anywhere. Positions are stored, not computed at
// open, so the layout is stable and the canvas never re-arranges under you.
//
// Only for a NEW diagram. Nothing re-arranges on page load, and a hand-placed
// layout that arrives complete is left exactly as sent.
const CANVAS = { width: 1600, height: 900 };

export function arrangeNew(nodes, edges) {
  const complete = nodes.length > 0 && nodes.every(
    (n) => n.position && Number.isFinite(n.position.x) && Number.isFinite(n.position.y),
  );
  if (complete) return nodes;

  try {
    const rf = nodes.map((n) => ({ ...n, type: "awsNode", data: { id: n.id, ...(n.image ? { image: n.image } : {}) } }));
    const rfEdges = (edges || []).map((e, i) => ({
      id: e.id || `e${i}`, source: e.source, target: e.target,
    }));
    const laid = layoutElements(rf, rfEdges, { canvas: CANVAS });
    const at = new Map(
      laid.filter((n) => n.type === "awsNode" && n.position)
        .map((n) => [n.id, { x: Math.round(n.position.x), y: Math.round(n.position.y) }]),
    );
    return nodes.map((n) => (at.has(n.id) ? { ...n, position: at.get(n.id) } : n));
  } catch {
    // Never fail a create over layout - the canvas lays out on open regardless.
    return nodes;
  }
}
