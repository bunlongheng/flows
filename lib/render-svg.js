// Server-side SVG renderer: turns a stored diagram ({nodes, edges}) into a
// self-contained SVG (dagre layout + inlined logos) so a remote agent can POST a
// diagram and get back an SVG string to embed in docs - no browser needed.
import { findService } from "../src/services.js";
// Build-time data-URI manifest (public/icons + public/brand). Bundled with the
// serverless function, so icons inline WITHOUT filesystem access at runtime.
import iconManifest from "./icon-data.js";
import { cleanNote } from "../src/note.js";
import { SUNSET, INK } from "../src/sunset.js";
// NOTE: intentionally NO dagre import here - pulling @dagrejs/dagre into the
// serverless function breaks its module load on Vercel. We render from the stored
// node positions (the app already lays out + saves them) and fall back to a small
// built-in layered layout when positions are missing.

const CW = 158, CH = 94; // drawn card size
const IW = 240, IH = 225; // picture node card size

// The card is a fixed width, so a sentence-length sub has to be cut rather than
// allowed to run out past the box.
const clip = (t, n) => (String(t).length > n ? `${String(t).slice(0, n - 1).trimEnd()}…` : String(t));

// Greedy word wrap for the note caption: at most `max` lines of ~`width` chars,
// the last one clipped. The SVG has no line clamp, so this is it.
function wrapLines(text, width, max) {
  const lines = [];
  let line = "";
  for (const w of String(text).split(/\s+/).filter(Boolean)) {
    if (lines.length === max) { line += " " + w; continue; } // overflow, clipped below
    const next = line ? `${line} ${w}` : w;
    if (next.length <= width || !line) { line = next; continue; }
    lines.push(line);
    line = w;
  }
  if (lines.length < max) lines.push(line);
  else lines[max - 1] = `${lines[max - 1]} ${line}`;
  return lines.filter(Boolean).map((l) => clip(l, width));
}

// Left-to-right layered layout used only when nodes have no stored positions.
function layeredLayout(nodes, edges) {
  const COL = 300, ROW = 150;
  const depth = {};
  nodes.forEach((n) => { depth[n.id] = 0; });
  // Edges back INTO the entry node are ignored, exactly as the canvas layout
  // does. Most real designs close a loop, and relaxing depth around one pushed
  // every node into its own column - a 12-node design came out as a 24:1 chain
  // that letterboxed to a hairline in the share card.
  const incoming = new Set(edges.map((e) => e.target));
  const start = (edges[0] && depth[edges[0].source] != null)
    ? edges[0].source
    : (nodes.find((n) => !incoming.has(n.id)) || nodes[0]).id;
  const ranked = edges.filter((e) => e.target !== start);
  for (let i = 0; i < nodes.length; i++) {
    let changed = false;
    for (const e of ranked) {
      if (depth[e.target] != null && depth[e.source] != null && depth[e.target] < depth[e.source] + 1) {
        depth[e.target] = depth[e.source] + 1; changed = true;
      }
    }
    if (!changed) break;
  }
  const cols = {};
  nodes.forEach((n) => { const d = depth[n.id] || 0; (cols[d] = cols[d] || []).push(n); });
  const out = [];
  for (const d of Object.keys(cols).map(Number).sort((a, b) => a - b)) {
    cols[d].forEach((n, i) => out.push({ ...n, cx: d * COL + n.w / 2, cy: i * ROW + n.h / 2 }));
  }
  return out;
}

// Positions each node: stored position if present, else the layered fallback.
export function layoutNodes(nodes, edges) {
  const havePos = nodes.length > 0 && nodes.every((n) => n.position && Number.isFinite(n.position.x) && Number.isFinite(n.position.y));
  if (havePos) return nodes.map((n) => ({ ...n, cx: n.position.x + n.w / 2, cy: n.position.y + n.h / 2 }));
  return layeredLayout(nodes, edges);
}

const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Blend a #hex with white so the node fill is an OPAQUE light tint (edges drawn
// underneath never show through).
function tint(hex, a = 0.1) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return "#f5f6f7";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const bl = (c) => Math.round(255 * (1 - a) + c * a);
  return `rgb(${bl(r)},${bl(g)},${bl(b)})`;
}

// Resolve an icon reference to a data: URI. Order: already-inline data: URI ->
// build-time manifest -> null (render the node without an icon rather than crash).
export function inlineIcon(icon) {
  if (!icon || typeof icon !== "string") return null;
  if (icon.startsWith("data:")) return icon;
  if (iconManifest[icon]) return iconManifest[icon];
  return null; // https icons are inlined at create time; unknown paths just skip
}

function pill(cx, cy, text, color) {
  const w = text.length * 6.2 + 30;
  return `<g transform="translate(${cx - w / 2},${cy - 13})">
    <rect width="${w}" height="26" rx="13" fill="#ffffff" stroke="${color}" stroke-width="1.5"/>
    <circle cx="16" cy="13" r="7" fill="${color}"/>
    <text x="${w / 2 + 6}" y="17" text-anchor="middle" font-size="11" font-weight="800" fill="${color}">${esc(text)}</text>
  </g>`;
}

// Same pill, drawn at a fixed 132x36 from its top-left corner instead of sized
// to its text and centred - this is the owner's hand-placed Start pill, which
// has to land exactly where they dropped it on the canvas.
function pillAt(x, y, w, h, text, color) {
  return `<g transform="translate(${x},${y})">
    <rect width="${w}" height="${h}" rx="${h / 2}" fill="#ffffff" stroke="${color}" stroke-width="1.5"/>
    <circle cx="16" cy="${h / 2}" r="7" fill="${color}"/>
    <text x="${w / 2 + 6}" y="${h / 2 + 4}" text-anchor="middle" font-size="11" font-weight="800" fill="${color}">${esc(text)}</text>
  </g>`;
}

// Where a line from `from` toward a rectangle's centre crosses the rectangle's
// own edge - so a placed pill's connector stops at the card's border instead of
// running into its middle.
function edgePoint(from, rect) {
  const dx = rect.cx - from.x, dy = rect.cy - from.y;
  if (!dx && !dy) return { x: rect.cx, y: rect.cy };
  const sx = dx !== 0 ? (rect.w / 2) / Math.abs(dx) : Infinity;
  const sy = dy !== 0 ? (rect.h / 2) / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return { x: rect.cx - dx * s, y: rect.cy - dy * s };
}

// A small filled arrowhead at (x, y), pointing along (dx, dy) - the same
// triangle the live canvas draws at the end of a marker's connector.
function arrowHead(x, y, dx, dy, color) {
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const px = -uy, py = ux;
  const backX = x - ux * 9, backY = y - uy * 9;
  const p1x = backX + px * 4.5, p1y = backY + py * 4.5;
  const p2x = backX - px * 4.5, p2y = backY - py * 4.5;
  return `<path d="M${p1x.toFixed(1)} ${p1y.toFixed(1)} L${x.toFixed(1)} ${y.toFixed(1)} L${p2x.toFixed(1)} ${p2y.toFixed(1)}" stroke="${color}" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
}

// Stagger each edge's dot so a frame shows a flow rather than every dot sitting
// at the same point. Mirrors offsetFor in src/flowClock.js, so a server-rendered
// GIF reads the same way the live canvas does.
function dotOffset(id) {
  let h = 0;
  const k = String(id);
  for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
}

// The red X badge marking a sunset node/edge label, centred on (cx, cy).
function sunsetX(cx, cy, r, half) {
  return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r}" fill="${esc(SUNSET.x)}"/>`
    + `<line x1="${(cx - half).toFixed(1)}" y1="${(cy - half).toFixed(1)}" x2="${(cx + half).toFixed(1)}" y2="${(cy + half).toFixed(1)}" stroke="#fff" stroke-width="2"/>`
    + `<line x1="${(cx - half).toFixed(1)}" y1="${(cy + half).toFixed(1)}" x2="${(cx + half).toFixed(1)}" y2="${(cy - half).toFixed(1)}" stroke="#fff" stroke-width="2"/>`;
}

export function renderDiagramSvg(rawNodes, rawEdges, opts = {}) {
  const nodes0 = (rawNodes || []).map((n) => ({
    id: n.id, position: n.position, icon: n.icon, image: n.image, label: n.label, color: n.color, sub: n.sub,
    note: cleanNote(n.note), sunset: n.sunset === true,
    // The owner's saved card size (real canvas px) scales the drawn card
    // proportionally - CW/CH and IW/IH are the drawn sizes for the unresized
    // default (180x180 icon, 240x225 picture).
    w: n.size ? Math.round(n.size.w * (n.image ? 1 : CW / 180)) : (n.image ? IW : CW),
    h: n.size ? Math.round(n.size.h * (n.image ? 1 : CH / 180)) : (n.image ? IH : CH),
    iconSize: n.iconSize && Number.isFinite(n.iconSize.w) && Number.isFinite(n.iconSize.h) ? n.iconSize : null,
    // Same real-px-to-drawn-px factor the card's own width uses above, reused
    // for the icon/photo inside it so a stretched icon keeps the aspect ratio
    // the owner dragged rather than being squashed by the card's own w/h ratio.
    iconK: n.image ? 1 : CW / 180,
  }));
  const edges = rawEdges || [];
  if (!nodes0.length) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" width="200" height="100"><rect width="200" height="100" fill="#fff"/></svg>`;
  }
  const laid = layoutNodes(nodes0, edges);
  const byId = {};
  const placed = laid.map((n) => {
    const svc = findService(n);
    // A picture node has no icon, so findService rarely matches - fall through
    // to the node's own label/sub, the same as AwsNode does on the canvas.
    const sunset = n.sunset === true;
    const p = {
      id: n.id, cx: n.cx, cy: n.cy, w: n.w, h: n.h, color: sunset ? SUNSET.border : (svc.color || INK),
      label: svc.label || n.label || n.id, sub: svc.sub || n.sub || "",
      icon: inlineIcon(svc.icon), image: n.image || null, note: n.note || "",
      iconSize: n.iconSize, iconK: n.iconK, sunset,
    };
    byId[n.id] = p;
    return p;
  });

  const PAD = 56;
  const minX = Math.min(...placed.map((p) => p.cx - p.w / 2)) - PAD - 150;
  const maxX = Math.max(...placed.map((p) => p.cx + p.w / 2)) + PAD;
  const minY = Math.min(...placed.map((p) => p.cy - p.h / 2)) - PAD;
  const maxY = Math.max(...placed.map((p) => p.cy + p.h / 2)) + PAD;
  const W = Math.round(maxX - minX), H = Math.round(maxY - minY);

  // Start = source of step 1 (else no-incoming, else first). No Destination
  // pill, here or in the app: it guessed at an endpoint the diagram never claimed.
  const hasIncoming = new Set(edges.map((e) => e.target));
  let startId = edges[0] && byId[edges[0].source] ? edges[0].source : (placed.find((p) => !hasIncoming.has(p.id)) || placed[0]).id;

  let edgesSvg = "", labelsSvg = "";
  for (const e of edges) {
    const s = byId[e.source], t = byId[e.target];
    if (!s || !t) continue;
    const edgeColor = (t.sunset || s.sunset) ? SUNSET.border : s.color;
    edgesSvg += `<line x1="${s.cx.toFixed(1)}" y1="${s.cy.toFixed(1)}" x2="${t.cx.toFixed(1)}" y2="${t.cy.toFixed(1)}" stroke="${esc(edgeColor)}" stroke-width="1.5" stroke-dasharray="5 4" opacity="0.7"/>`;
    // One frame of the travelling dot, for the animated GIF. Edges here are
    // straight lines, so the position is a plain lerp - no path measuring. The
    // dot wears the SOURCE colour, exactly as the live canvas draws it.
    if (typeof opts.dotPhase === "number") {
      const dt = (opts.dotPhase + dotOffset(e.id || `${e.source}-${e.target}`)) % 1;
      const dx = s.cx + (t.cx - s.cx) * dt, dy = s.cy + (t.cy - s.cy) * dt;
      const fade = Math.min(1, Math.min(dt, 1 - dt) / 0.12);
      edgesSvg += `<circle cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="5" fill="${esc(edgeColor)}" opacity="${(0.18 * fade).toFixed(3)}"/>`
        + `<circle cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="2.4" fill="${esc(edgeColor)}" opacity="${fade.toFixed(3)}"/>`;
    }
    if (e.label) {
      const mx = (s.cx + t.cx) / 2, my = (s.cy + t.cy) / 2, w = e.label.length * 5.6 + 16;
      const badgeFill = t.sunset ? SUNSET.tint : "#1c1e21";
      const badgeStroke = t.sunset ? ` stroke="${esc(SUNSET.border)}" stroke-width="1"` : "";
      const badgeText = t.sunset ? SUNSET.ink : "#fff";
      labelsSvg += `<g transform="translate(${(mx - w / 2).toFixed(1)},${(my - 9).toFixed(1)})"><rect width="${w.toFixed(1)}" height="18" rx="9" fill="${esc(badgeFill)}"${badgeStroke}/><text x="${(w / 2).toFixed(1)}" y="12.5" text-anchor="middle" font-size="9" font-weight="700" fill="${esc(badgeText)}">${esc(e.label)}</text>${t.sunset ? sunsetX(w, 0, 6, 3) : ""}</g>`;
    }
  }

  let nodesSvg = "";
  placed.forEach((p, i) => {
    const w = p.w, h = p.h;
    const x = (p.cx - w / 2).toFixed(1), y = (p.cy - h / 2).toFixed(1);
    if (p.image) {
      // Picture node: the stored data URI goes straight in - it was already
      // resolved and inlined at create/update time (lib/resolve-image.js). The
      // photo keeps a 4:3 ratio off the card's own width, and the caption
      // below it follows the card's own height.
      // The photo fills the width at 4:3 but never the caption's room: a card
      // widened without being made taller keeps its label inside.
      // The owner's own iconSize, scaled by the same real-px-to-drawn-px factor
      // as the card, wins over the fill-the-card default - clamped to the
      // card's inner width and to the room left above the label.
      const pw = p.iconSize ? Math.max(10, Math.min(w - 20, Math.round(p.iconSize.w * p.iconK))) : w - 20;
      const ph = p.iconSize ? Math.max(10, Math.min(h - 60, Math.round(p.iconSize.h * p.iconK))) : Math.min(pw * 3 / 4, h - 60);
      const picX = Math.round((w - pw) / 2);
      const labelY = h - 28, subY = h - 15;
      const tintFill = p.sunset ? SUNSET.tint : tint(p.color, 0.08);
      const labelFill = p.sunset ? SUNSET.ink : "#111827";
      const subFill = p.sunset ? SUNSET.ink : "#6b7280";
      const imgAttrs = p.sunset ? ` filter="url(#sunset-gray)" opacity="0.55"` : "";
      nodesSvg += `<g transform="translate(${x},${y})">
      <rect width="${w}" height="${h}" fill="#ffffff"/>
      <rect width="${w}" height="${h}" fill="${esc(tintFill)}" stroke="${esc(p.color)}" stroke-width="1"/>
      <clipPath id="pic-${i}"><rect x="${picX}" y="10" width="${pw}" height="${ph}"/></clipPath>
      <image xlink:href="${esc(p.image)}" href="${esc(p.image)}" x="${picX}" y="10" width="${pw}" height="${ph}" preserveAspectRatio="xMidYMid slice" clip-path="url(#pic-${i})"${imgAttrs}/>
      ${p.sunset ? sunsetX(picX + pw, 10, 8, 4) : ""}
      <text x="${w / 2}" y="${labelY.toFixed(1)}" text-anchor="middle" font-size="12" font-weight="700" fill="${esc(labelFill)}">${esc(p.label)}</text>
      ${p.sub ? `<text x="${w / 2}" y="${subY.toFixed(1)}" text-anchor="middle" font-size="9.5" fill="${esc(subFill)}">${esc(clip(p.sub, 30))}</text>` : ""}
    </g>`;
    } else {
      const labelY = h - 21, subY = h - 8;
      const iw = p.iconSize ? Math.max(10, Math.min(w - 20, Math.round(p.iconSize.w * p.iconK))) : 46;
      const ih = p.iconSize ? Math.max(10, Math.min(h - 32, Math.round(p.iconSize.h * p.iconK))) : 46;
      const iconX = (w - iw) / 2;
      const tintFill = p.sunset ? SUNSET.tint : tint(p.color, 0.08);
      const labelFill = p.sunset ? SUNSET.ink : "#111827";
      const subFill = p.sunset ? SUNSET.ink : "#6b7280";
      const imgAttrs = p.sunset ? ` filter="url(#sunset-gray)" opacity="0.55"` : "";
      nodesSvg += `<g transform="translate(${x},${y})">
      <rect width="${w}" height="${h}" fill="#ffffff"/>
      <rect width="${w}" height="${h}" fill="${esc(tintFill)}" stroke="${esc(p.color)}" stroke-width="1"/>
      ${p.icon ? `<image xlink:href="${esc(p.icon)}" href="${esc(p.icon)}" x="${iconX.toFixed(1)}" y="11" width="${iw}" height="${ih}" preserveAspectRatio="xMidYMid meet"${imgAttrs}/>` : ""}
      ${p.icon && p.sunset ? sunsetX(iconX + iw, 11, 8, 4) : ""}
      <text x="${w / 2}" y="${labelY.toFixed(1)}" text-anchor="middle" font-size="12" font-weight="700" fill="${esc(labelFill)}">${esc(p.label)}</text>
      ${p.sub ? `<text x="${w / 2}" y="${subY.toFixed(1)}" text-anchor="middle" font-size="9.5" fill="${esc(subFill)}">${esc(clip(p.sub, 30))}</text>` : ""}
    </g>`;
    }
    // The note: black text in a black frame hanging off the bottom-left corner,
    // the same caption the app draws, so a shared SVG says what each step does.
    if (p.note) {
      const wrapWidth = Math.max(20, Math.round((p.image ? 52 : 34) * p.w / (p.image ? IW : CW)));
      const lines = wrapLines(p.note, wrapWidth, 10);
      const nh = lines.length * 12 + 7;
      nodesSvg += `<g transform="translate(${x},${(p.cy + h / 2 + 5).toFixed(1)})">
      <rect width="${w}" height="${nh}" fill="#ffffff" stroke="#111111" stroke-width="1"/>
      ${lines.map((l, idx) => `<text x="6" y="${13 + idx * 12}" font-size="9" fill="#111111">${esc(l)}</text>`).join("")}
    </g>`;
    }
  });

  let markers = "";
  const s = byId[startId];
  if (s && opts.start && Number.isFinite(opts.start.x) && Number.isFinite(opts.start.y)) {
    // The owner dragged the Start pill to its own spot - draw it there, top-left
    // at (start.x, start.y), and run the connector from its centre to wherever
    // it crosses the start card's edge.
    const px = opts.start.x, py = opts.start.y, pw = 132, ph = 36;
    const pillCenter = { x: px + pw / 2, y: py + ph / 2 };
    const end = edgePoint(pillCenter, { cx: s.cx, cy: s.cy, w: s.w, h: s.h });
    markers += `<line x1="${pillCenter.x.toFixed(1)}" y1="${pillCenter.y.toFixed(1)}" x2="${end.x.toFixed(1)}" y2="${end.y.toFixed(1)}" stroke="#16a34a" stroke-width="1.5" stroke-dasharray="5 4"/>`
      + arrowHead(end.x, end.y, end.x - pillCenter.x, end.y - pillCenter.y, "#16a34a")
      + pillAt(px, py, pw, ph, "Start here", "#16a34a");
  } else if (s) {
    const mx = s.cx - s.w / 2 - 96, my = s.cy;
    markers += `<line x1="${(mx + 66).toFixed(1)}" y1="${my.toFixed(1)}" x2="${(s.cx - s.w / 2).toFixed(1)}" y2="${my.toFixed(1)}" stroke="#16a34a" stroke-width="1.5" stroke-dasharray="5 4"/>` + pill(mx, my, "Start here", "#16a34a");
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${minX.toFixed(1)} ${minY.toFixed(1)} ${W} ${H}" width="${W}" height="${H}" font-family="Inter, -apple-system, Arial, sans-serif"><defs><filter id="sunset-gray"><feColorMatrix type="saturate" values="0"/></filter></defs><rect x="${minX.toFixed(1)}" y="${minY.toFixed(1)}" width="${W}" height="${H}" fill="#ffffff"/>${edgesSvg}${markers}${nodesSvg}${labelsSvg}</svg>`;
}
