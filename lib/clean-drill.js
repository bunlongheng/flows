import { cleanStyle } from "../src/style.js";
import { PANELS } from "../src/view-state.js";

const str = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const okId = (v) => typeof v === "string" && v.length > 0 && v.length <= 60;

// A card's drill-in view: a small sub-diagram (e.g. the tables behind a
// database card) opened from the card panel. Same node keys as a card, minus
// a nested drill and a level. cleanNode is passed in by lib/clean-node.js so
// the 2 files do not import each other. Returns null when nothing valid is left.
export const cleanDrill = (d, cleanNode) => {
  if (!d || typeof d !== "object" || Array.isArray(d)) return null;
  if (!Array.isArray(d.nodes) || !d.nodes.length || d.nodes.length > 100) return null;
  const edgesIn = d.edges === undefined ? [] : d.edges;
  if (!Array.isArray(edgesIn) || edgesIn.length > 300) return null;
  const ids = new Set();
  const nodes = [];
  for (const n of d.nodes) {
    if (!n || typeof n !== "object" || !okId(n.id) || ids.has(n.id)) continue;
    ids.add(n.id);
    const p = n.position && typeof n.position === "object" ? n.position : n;
    const pos = Number.isFinite(p.x) && Number.isFinite(p.y) ? { position: { x: Math.round(p.x), y: Math.round(p.y) } } : {};
    // eslint-disable-next-line no-unused-vars
    const { drill, level, ...rest } = cleanNode({ ...n, drill: undefined, level: undefined });
    nodes.push({ id: n.id, ...pos, ...rest });
  }
  if (!nodes.length) return null;
  const edges = [];
  edgesIn.forEach((e, i) => {
    if (!e || typeof e !== "object" || !ids.has(e.source) || !ids.has(e.target)) return;
    const style = cleanStyle(e.style, "edge");
    edges.push({
      id: okId(e.id) ? e.id : `d${i + 1}`,
      source: e.source,
      target: e.target,
      ...(str(e.label, 60) ? { label: str(e.label, 60) } : {}),
      ...(str(e.description, 300) ? { description: str(e.description, 300) } : {}),
      ...(style ? { style } : {}),
    });
  });
  const panels = Array.isArray(d.view?.panels) ? PANELS.filter((x) => d.view.panels.includes(x)) : [];
  return {
    ...(str(d.title, 120) ? { title: str(d.title, 120) } : {}),
    nodes,
    edges,
    ...(panels.length ? { view: { panels } } : {}),
  };
};
