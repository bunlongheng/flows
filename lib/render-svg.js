// Server-side SVG renderer: turns a stored diagram ({nodes, edges}) into a
// self-contained SVG (dagre layout + inlined logos) so a remote agent can POST a
// diagram and get back an SVG string to embed in docs - no browser needed.
import { findService } from "../src/services.js";
// Build-time data-URI manifest (public/icons + public/brand). Bundled with the
// serverless function, so icons inline WITHOUT filesystem access at runtime.
import iconManifest from "./icon-data.js";
import { cleanNote } from "../src/note.js";
// NOTE: intentionally NO dagre import here - pulling @dagrejs/dagre into the
// serverless function breaks its module load on Vercel. We render from the stored
// node positions (the app already lays out + saves them) and fall back to a small
// built-in layered layout when positions are missing.

const CW = 158, CH = 94; // drawn card size

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
    cols[d].forEach((n, i) => out.push({ ...n, cx: d * COL + CW / 2, cy: i * ROW + CH / 2 }));
  }
  return out;
}

// Positions each node: stored position if present, else the layered fallback.
function layoutNodes(nodes, edges) {
  const havePos = nodes.length > 0 && nodes.every((n) => n.position && Number.isFinite(n.position.x) && Number.isFinite(n.position.y));
  if (havePos) return nodes.map((n) => ({ ...n, cx: n.position.x + CW / 2, cy: n.position.y + CH / 2 }));
  return layeredLayout(nodes, edges);
}

// Datastores that can be the single "Destination" (source of truth), same order
// as the app.
const SOURCE_OF_TRUTH = [
  "dynamo", "dynamodb", "rds", "postgres", "mysql", "aurora", "spanner", "cockroach",
  "cassandra", "keyspaces", "mongodb", "bigtable", "s3", "storage",
  "redis", "elasticache", "memcached", "opensearch", "elasticsearch",
];

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
function inlineIcon(icon) {
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

// opts.destination=false drops the red "Destination" pill. The app itself shows
// only a Start pill (it guessed at an endpoint the diagram never claimed), so the
// share card opts out to match what you see on click-through. The default stays
// true so the ?format=svg export keeps rendering exactly as it always has.
// Stagger each edge's dot so a frame shows a flow rather than every dot sitting
// at the same point. Mirrors offsetFor in src/flowClock.js, so a server-rendered
// GIF reads the same way the live canvas does.
function dotOffset(id) {
  let h = 0;
  const k = String(id);
  for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
}

export function renderDiagramSvg(rawNodes, rawEdges, opts = {}) {
  const nodes0 = (rawNodes || []).map((n) => ({ id: n.id, position: n.position, icon: n.icon, label: n.label, color: n.color, sub: n.sub, note: cleanNote(n.note) }));
  const edges = rawEdges || [];
  if (!nodes0.length) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" width="200" height="100"><rect width="200" height="100" fill="#fff"/></svg>`;
  }
  const laid = layoutNodes(nodes0, edges);
  const byId = {};
  const placed = laid.map((n) => {
    const svc = findService(n);
    const p = { id: n.id, cx: n.cx, cy: n.cy, color: svc.color || "#6b7280", label: svc.label || n.id, sub: svc.sub || "", icon: inlineIcon(svc.icon), note: n.note || "" };
    byId[n.id] = p;
    return p;
  });

  const PAD = 56;
  const minX = Math.min(...placed.map((p) => p.cx - CW / 2)) - PAD - 150;
  const maxX = Math.max(...placed.map((p) => p.cx + CW / 2)) + PAD + 170;
  const minY = Math.min(...placed.map((p) => p.cy - CH / 2)) - PAD;
  const maxY = Math.max(...placed.map((p) => p.cy + CH / 2)) + PAD;
  const W = Math.round(maxX - minX), H = Math.round(maxY - minY);

  // Start = source of step 1 (else no-incoming, else first). Destination = single datastore.
  const hasIncoming = new Set(edges.map((e) => e.target));
  let startId = edges[0] && byId[edges[0].source] ? edges[0].source : (placed.find((p) => !hasIncoming.has(p.id)) || placed[0]).id;
  const endId = SOURCE_OF_TRUTH.find((id) => byId[id] && id !== startId) || null;

  let edgesSvg = "", labelsSvg = "";
  for (const e of edges) {
    const s = byId[e.source], t = byId[e.target];
    if (!s || !t) continue;
    edgesSvg += `<line x1="${s.cx.toFixed(1)}" y1="${s.cy.toFixed(1)}" x2="${t.cx.toFixed(1)}" y2="${t.cy.toFixed(1)}" stroke="${esc(s.color)}" stroke-width="1.5" stroke-dasharray="5 4" opacity="0.7"/>`;
    // One frame of the travelling dot, for the animated GIF. Edges here are
    // straight lines, so the position is a plain lerp - no path measuring. The
    // dot wears the SOURCE colour, exactly as the live canvas draws it.
    if (typeof opts.dotPhase === "number") {
      const dt = (opts.dotPhase + dotOffset(e.id || `${e.source}-${e.target}`)) % 1;
      const dx = s.cx + (t.cx - s.cx) * dt, dy = s.cy + (t.cy - s.cy) * dt;
      const fade = Math.min(1, Math.min(dt, 1 - dt) / 0.12);
      edgesSvg += `<circle cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="5" fill="${esc(s.color)}" opacity="${(0.18 * fade).toFixed(3)}"/>`
        + `<circle cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="2.4" fill="${esc(s.color)}" opacity="${fade.toFixed(3)}"/>`;
    }
    if (e.label) {
      const mx = (s.cx + t.cx) / 2, my = (s.cy + t.cy) / 2, w = e.label.length * 5.6 + 16;
      labelsSvg += `<g transform="translate(${(mx - w / 2).toFixed(1)},${(my - 9).toFixed(1)})"><rect width="${w.toFixed(1)}" height="18" rx="9" fill="#1c1e21"/><text x="${(w / 2).toFixed(1)}" y="12.5" text-anchor="middle" font-size="9" font-weight="700" fill="#fff">${esc(e.label)}</text></g>`;
    }
  }

  let nodesSvg = "";
  for (const p of placed) {
    const x = (p.cx - CW / 2).toFixed(1), y = (p.cy - CH / 2).toFixed(1);
    nodesSvg += `<g transform="translate(${x},${y})">
      <rect width="${CW}" height="${CH}" fill="#ffffff"/>
      <rect width="${CW}" height="${CH}" fill="${tint(p.color, 0.08)}" stroke="${esc(p.color)}" stroke-width="1"/>
      ${p.icon ? `<image xlink:href="${esc(p.icon)}" href="${esc(p.icon)}" x="${(CW - 46) / 2}" y="11" width="46" height="46" preserveAspectRatio="xMidYMid meet"/>` : ""}
      <text x="${CW / 2}" y="73" text-anchor="middle" font-size="12" font-weight="700" fill="#111827">${esc(p.label)}</text>
      ${p.sub ? `<text x="${CW / 2}" y="86" text-anchor="middle" font-size="9.5" fill="#6b7280">${esc(clip(p.sub, 30))}</text>` : ""}
    </g>`;
    // The note: black text in a black frame hanging off the bottom-left corner,
    // the same caption the app draws, so a shared SVG says what each step does.
    if (p.note) {
      const lines = wrapLines(p.note, 34, 10);
      const nh = lines.length * 12 + 7;
      nodesSvg += `<g transform="translate(${x},${(p.cy + CH / 2 + 5).toFixed(1)})">
      <rect width="${CW}" height="${nh}" fill="#ffffff" stroke="#111111" stroke-width="1"/>
      ${lines.map((l, i) => `<text x="6" y="${13 + i * 12}" font-size="9" fill="#111111">${esc(l)}</text>`).join("")}
    </g>`;
    }
  }

  let markers = "";
  const s = byId[startId];
  if (s) {
    const mx = s.cx - CW / 2 - 96, my = s.cy;
    markers += `<line x1="${(mx + 66).toFixed(1)}" y1="${my.toFixed(1)}" x2="${(s.cx - CW / 2).toFixed(1)}" y2="${my.toFixed(1)}" stroke="#16a34a" stroke-width="1.5" stroke-dasharray="5 4"/>` + pill(mx, my, "Start here", "#16a34a");
  }
  const en = opts.destination === false ? null : endId && byId[endId];
  if (en) {
    const mx = en.cx + CW / 2 + 90, my = en.cy;
    markers += `<line x1="${(en.cx + CW / 2).toFixed(1)}" y1="${my.toFixed(1)}" x2="${(mx - 66).toFixed(1)}" y2="${my.toFixed(1)}" stroke="#dc2626" stroke-width="1.5" stroke-dasharray="5 4"/>` + pill(mx, my, "Destination", "#dc2626");
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${minX.toFixed(1)} ${minY.toFixed(1)} ${W} ${H}" width="${W}" height="${H}" font-family="Inter, -apple-system, Arial, sans-serif"><rect x="${minX.toFixed(1)}" y="${minY.toFixed(1)}" width="${W}" height="${H}" fill="#ffffff"/>${edgesSvg}${markers}${nodesSvg}${labelsSvg}</svg>`;
}
