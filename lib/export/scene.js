// The one place a stored flow ({nodes, edges}) becomes plain geometry, so every
// interchange export (Excalidraw, draw.io, Miro) draws the SAME diagram. Unlike
// render-svg.js - which squashes cards to 158x94 to fit a share card - this
// keeps TRUE canvas px, because the file lands in a tool the owner will keep
// editing and a card there has to be the size it was here.
import { findService } from "../../src/services.js";
import { cleanNote } from "../../src/note.js";
import { SUNSET, INK } from "../../src/sunset.js";
import { layoutNodes, inlineIcon } from "../render-svg.js";

// Real canvas card sizes (src/components/AwsNode.jsx:227): a service card, and
// the wider card a picture node draws in.
export const CARD_W = 180, CARD_H = 180;
export const PIC_W = 240, PIC_H = 225;

// Nodes come out top-left anchored (React Flow's own convention) and already
// laid out: a flow whose nodes were never dragged has no stored position, so it
// falls through to the same layered fallback the SVG export uses.
export function buildScene(rawNodes, rawEdges) {
  const sized = (rawNodes || []).map((n) => ({
    id: n.id,
    position: n.position,
    icon: n.icon,
    image: n.image || null,
    label: n.label,
    color: n.color,
    sub: n.sub,
    note: cleanNote(n.note),
    sunset: n.sunset === true,
    w: n.size && Number.isFinite(n.size.w) ? Math.round(n.size.w) : (n.image ? PIC_W : CARD_W),
    h: n.size && Number.isFinite(n.size.h) ? Math.round(n.size.h) : (n.image ? PIC_H : CARD_H),
  }));

  const edgesIn = rawEdges || [];
  if (!sized.length) return { nodes: [], edges: [], bounds: { x: 0, y: 0, w: 0, h: 0 } };

  const nodes = layoutNodes(sized, edgesIn).map((n) => {
    const svc = findService(n);
    return {
      id: n.id,
      x: Math.round(n.cx - n.w / 2),
      y: Math.round(n.cy - n.h / 2),
      w: n.w,
      h: n.h,
      label: svc.label || n.label || n.id,
      sub: svc.sub || n.sub || "",
      // Sunset is silver and nothing else in the app is, so it overrides the
      // service's own brand colour (src/sunset.js).
      color: n.sunset ? SUNSET.border : (svc.color || INK),
      // A picture node carries its own photo; everything else resolves through
      // the build-time icon manifest to a base64 data URI. null means no logo
      // was found and the target draws a plain card, same as the canvas does.
      iconDataUri: n.image || inlineIcon(svc.icon || n.icon) || null,
      isPicture: !!n.image,
      note: n.note || "",
      sunset: n.sunset,
    };
  });

  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  // An edge INTO or OUT OF a decommissioned node is on its way out too, so it
  // is drawn silver as well - matching the canvas.
  const edges = edgesIn
    .filter((e) => byId[e.source] && byId[e.target])
    .map((e) => ({
      source: e.source,
      target: e.target,
      label: e.label ? String(e.label) : "",
      sunset: byId[e.source].sunset || byId[e.target].sunset,
    }));

  const bounds = {
    x: Math.min(...nodes.map((n) => n.x)),
    y: Math.min(...nodes.map((n) => n.y)),
    w: Math.max(...nodes.map((n) => n.x + n.w)) - Math.min(...nodes.map((n) => n.x)),
    h: Math.max(...nodes.map((n) => n.y + n.h)) - Math.min(...nodes.map((n) => n.y)),
  };

  return { nodes, edges, bounds };
}
