import { SERVICES } from "../src/services.js";
import { dataIconBigEnough, MIN_PX } from "./resolve-icon.js";

// The ONE validation policy for a diagram, shared by the 3 doors that write
// flows: the Bearer create API, the MCP server, and AI generate. Each
// used to carry its own copy (or none, for AI generate), and they had drifted.
export const MAX_NODES = 100;
export const MAX_EDGES = 300;
export const MAX_ICON_BYTES = 24000;

// A bring-your-own icon is a same-origin asset path (never protocol-relative
// "//host"), an https URL, or a data:image URI of a known type with a real
// ";base64," or "," boundary - "data:image/bmp" or "javascript:" never pass.
export const okCustomIcon = (ic) =>
  typeof ic === "string" &&
  (/^\/(?!\/)[\w./-]+\.(svg|png|webp|jpe?g|gif)$/i.test(ic) ||
    ic.startsWith("https://") ||
    /^data:image\/(png|jpeg|svg\+xml|webp|gif)[;,]/.test(ic));

// A node colour goes straight into SVG attributes, so it is a 6-digit hex or nothing.
export const okColor = (c) => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c);

export const unresolvedNodes = (nodes) =>
  [...new Set(nodes.filter((n) => !SERVICES[n.id]?.icon && !okCustomIcon(n.icon)).map((n) => n.id))];

// Returns null when the design passes, otherwise { error, unresolved? } for the
// first rule it breaks, in the order the API has always reported them.
// Also normalises in place: a pasted icon/colour on a catalog id is dropped.
export function validateDesign({ nodes, edges = [] }) {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return { error: "Missing required field: nodes (non-empty array of { id, position })." };
  }
  for (const n of nodes) {
    if (!n || typeof n.id !== "string" || !n.id.trim()) {
      return { error: 'Every node must be an object with a non-empty string "id" (a known service key).' };
    }
  }
  // A catalog id always draws the catalog logo (findService), so a pasted icon
  // or colour on it is dead weight - and it is how a 16x16 favicon ended up
  // stored on "integry". Drop them at the door so the row never carries them.
  for (const n of nodes) {
    if (SERVICES[n.id]?.icon) { delete n.icon; delete n.color; }
  }
  const unresolved = unresolvedNodes(nodes);
  if (unresolved.length) {
    return {
      error: `Every node must render a real logo: use a known catalog service id, OR give the node a custom "icon" (a remote https URL, a data:image/... URI, or a same-origin path like "/brand/foo.svg") plus a "label". Unresolved: ${unresolved.join(", ")}.`,
      unresolved,
    };
  }
  const bigIcon = nodes.find((n) => typeof n.icon === "string" && n.icon.startsWith("data:") && n.icon.length > MAX_ICON_BYTES);
  if (bigIcon) return { error: `Custom data: icon on node "${bigIcon.id}" is too large (max ~24KB). Optimize the SVG/PNG or host it under /brand and pass the path.` };
  const tiny = nodes.find((n) => typeof n.icon === "string" && n.icon.startsWith("data:") && !dataIconBigEnough(n.icon));
  if (tiny) return { error: `Custom data: icon on node "${tiny.id}" is smaller than ${MIN_PX}px - that is a favicon, not a logo. Paste the brand's real logo (SVG preferred) or use a catalog service id.` };
  if (!Array.isArray(edges)) return { error: 'Field "edges" must be an array of { source, target }.' };
  for (const e of edges) {
    if (!e || typeof e.source !== "string" || typeof e.target !== "string") {
      return { error: 'Every edge must have string "source" and "target" node ids.' };
    }
  }
  if (nodes.length > MAX_NODES) return { error: `too many nodes (max ${MAX_NODES}).` };
  if (edges.length > MAX_EDGES) return { error: `too many edges (max ${MAX_EDGES}).` };
  return null;
}
