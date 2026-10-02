// Server-side SVG renderer: turns a stored diagram ({nodes, edges, view_state})
// into a self-contained SVG so an agent, a README, a Confluence page or a PR
// can show a diagram by URL - no browser needed.
//
// It draws what the canvas draws. The cards are the canvas's 180x180 boxes with
// every format-panel pick, the lines come from the SAME routing module the
// canvas uses (src/edgeGeometry.js) so a bend, a pinned end, a slid badge and a
// picked arrow type all land where the owner put them, and the badge, notes
// and Start pill follow the saved view_state. An export is the diagram the
// owner approved, not an approximation of it.
import { findService } from "../src/services.js";
// Build-time data-URI manifest (public/icons + public/brand). Bundled with the
// serverless function, so icons inline WITHOUT filesystem access at runtime.
import iconManifest from "./icon-data.js";
import { cleanNote, noteRuns, linkLabel } from "../src/note.js";
import { SUNSET, INK } from "../src/sunset.js";
import { tagText } from "../src/tag.js";
import { glowFor } from "../src/flowClock.js";
import { dashArray } from "../src/style.js";
import { routeEdge, pointAlongPath, T_MIN, T_MAX } from "../src/edgeGeometry.js";
// NOTE: intentionally NO dagre import here - pulling @dagrejs/dagre into the
// serverless function breaks its module load on Vercel. We render from the stored
// node positions (the app already lays out + saves them) and fall back to a small
// built-in layered layout when positions are missing.

// The canvas's card: 180x180 with 10px inside every edge (AwsNode.jsx), a
// picture card 240x225. The owner's saved size is used as is.
const CARD = 180;
const PIC_W = 240, PIC_H = 225;
const PAD = 10, GAP = 6;
// A note hangs 5px under its card, and the routing keeps 14px more under it.
const NOTE_GAP = 5, NOTE_CLEAR = 14;
const NOTE_FS = 10, NOTE_LH = 14;
const START_GREEN = "#16a34a";

// ─── Text ─────────────────────────────────────────────────────────────────────
// The width of a run of text, close enough to decide where a line wraps. Inter
// (what resvg draws with, and what the SVG asks a browser for) is a touch
// wider than the system font, so wrapping here errs on the early side and a
// card never shows a word the canvas would have clipped.
function charW(ch) {
  if (ch === " ") return 0.28;
  if (/[il.,:;'|!I[\]()jft]/.test(ch)) return 0.3;
  if (/[mwMW@%]/.test(ch)) return 0.9;
  if (/[A-Z]/.test(ch)) return 0.68;
  if (/[0-9]/.test(ch)) return 0.6;
  if (/[a-z]/.test(ch)) return 0.56;
  return 0.6;
}
export function textWidth(text, fs, weight = 400) {
  let w = 0;
  for (const ch of String(text || "")) w += charW(ch);
  return w * fs * (weight >= 700 ? 1.06 : weight >= 600 ? 1.03 : 1);
}

// Greedy word wrap to at most `max` lines; the last line is cut with an
// ellipsis when the text runs on, which is what the canvas's line clamp shows.
// A word wider than the line is broken, as overflow-wrap: anywhere does.
function wrapText(text, width, fs, weight, max) {
  const fits = (s) => textWidth(s, fs, weight) <= width;
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  const push = (w) => {
    const next = line ? `${line} ${w}` : w;
    if (fits(next)) { line = next; return; }
    if (line) { lines.push(line); line = ""; }
    // Break a word that does not fit on a line of its own.
    let rest = w;
    while (!fits(rest) && rest.length > 1) {
      let cut = rest.length - 1;
      while (cut > 1 && !fits(rest.slice(0, cut))) cut--;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    line = rest;
  };
  for (const w of words) push(w);
  if (line) lines.push(line);
  if (lines.length <= max) return lines;
  const kept = lines.slice(0, max);
  let last = kept[max - 1];
  while (last.length && !fits(`${last}…`)) last = last.slice(0, -1).trimEnd();
  kept[max - 1] = `${last}…`;
  return kept;
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
    cols[d].forEach((n, i) => out.push(placed(n, d * COL, i * ROW)));
  }
  return out;
}

// Top-left plus centre, so the scene exporters keep reading cx / cy.
const placed = (n, x, y) => ({ ...n, x, y, cx: x + (n.w || CARD) / 2, cy: y + (n.h || CARD) / 2 });

// Positions each node: stored position if present, else the layered fallback.
export function layoutNodes(nodes, edges) {
  const havePos = nodes.length > 0 && nodes.every((n) => n.position && Number.isFinite(n.position.x) && Number.isFinite(n.position.y));
  if (havePos) return nodes.map((n) => placed(n, n.position.x, n.position.y));
  return layeredLayout(nodes, edges);
}

const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const f1 = (n) => Number(n).toFixed(1);

// Blend a #hex with white so the node fill is an OPAQUE light tint (edges drawn
// underneath never show through). The canvas paints `${color}14` over white,
// which is this at 8%.
function tint(hex, a = 0.08) {
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

// The red X marking a sunset edge badge, centred on (cx, cy). Never on a card.
function sunsetX(cx, cy, r, half) {
  return `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${r}" fill="${esc(SUNSET.x)}" stroke="#fff" stroke-width="1"/>`
    + `<line x1="${f1(cx - half)}" y1="${f1(cy - half)}" x2="${f1(cx + half)}" y2="${f1(cy + half)}" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`
    + `<line x1="${f1(cx - half)}" y1="${f1(cy + half)}" x2="${f1(cx + half)}" y2="${f1(cy - half)}" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`;
}

// ─── Notes ────────────────────────────────────────────────────────────────────
// The note's lines, each a list of runs, wrapped to the card's inner width and
// clamped to 10 lines the way the canvas clamps them. A link shows its ticket
// key or PR number, not its URL, and keeps the href.
function noteLines(note, innerW) {
  const runs = noteRuns(note).map((r) => (r.url ? { ...r, text: linkLabel(r.url) } : r));
  const fsOf = (r) => (r.code ? NOTE_FS * 0.92 : NOTE_FS);
  const wOf = (r, s) => textWidth(s, fsOf(r), r.b ? 700 : 400) + (r.code ? 8 : 0);
  const lines = [];
  let line = [], lineW = 0;
  const flush = () => { if (line.length) lines.push(line); line = []; lineW = 0; };
  for (const r of runs) {
    // A link never breaks; everything else breaks at spaces, and the spaces
    // ride along with the word before them.
    const pieces = r.url ? [r.text] : r.text.split(/(?<=\s)/);
    for (const piece of pieces) {
      if (!piece) continue;
      const w = wOf(r, piece);
      if (lineW + w > innerW && line.length && piece.trim()) {
        flush();
        if (!piece.trim()) continue;
      }
      const last = line[line.length - 1];
      if (last && last.run === r) last.text += piece; else line.push({ run: r, text: piece });
      lineW += w;
    }
  }
  flush();
  if (lines.length > 10) {
    const kept = lines.slice(0, 10);
    const tail = kept[9][kept[9].length - 1];
    tail.text = `${tail.text.trimEnd().slice(0, -1)}…`;
    return kept;
  }
  return lines;
}

function noteBlock(lines, w, chips) {
  const boxH = lines.length * NOTE_LH + 8;
  // display: inline-block; max-width: 100%: a 1-line note is as wide as its
  // text, a longer one takes the card's width.
  const textW = Math.max(...lines.map((l) => l.reduce((a, p) => a + textWidth(p.text, p.run.code ? NOTE_FS * 0.92 : NOTE_FS, p.run.b ? 700 : 400) + (p.run.code ? 8 : 0), 0)));
  const boxW = Math.min(w + 2, Math.ceil(textW) + 14);
  let out = `<rect x="-1" y="0" width="${boxW}" height="${boxH}" fill="#ffffff" stroke="#111111" stroke-width="1"/>`;
  lines.forEach((line, i) => {
    let x = 5;
    let t = `<text x="5" y="${f1(4 + i * NOTE_LH + NOTE_FS)}" font-size="${NOTE_FS}" fill="#111111" xml:space="preserve">`;
    for (const p of line) {
      const r = p.run;
      const fs = r.code ? NOTE_FS * 0.92 : NOTE_FS;
      const w = textWidth(p.text, fs, r.b ? 700 : 400);
      if (r.code) {
        // The tinted chip a code run sits on. Drawn before the text line, so it
        // is collected on the side and emitted first.
        chips.push(`<rect x="${f1(x)}" y="${f1(3 + i * NOTE_LH)}" width="${f1(w + 8)}" height="${NOTE_LH - 1}" rx="4" fill="#f1f5f9" stroke="#e2e8f0" stroke-width="1"/>`);
        x += 4;
      }
      const deco = [r.u && "underline", r.s && "line-through", r.url && "underline"].filter(Boolean).join(" ");
      const attrs = [
        r.b ? ' font-weight="700"' : "", r.i ? ' font-style="italic"' : "",
        r.code ? ` font-size="${f1(fs)}"` : "",
        deco ? ` text-decoration="${deco}"` : "",
        r.url ? ' fill="#1d4ed8"' : "",
      ].join("");
      const span = `<tspan x="${f1(x)}"${attrs}>${esc(p.text)}</tspan>`;
      t += r.url ? `<a href="${esc(r.url)}">${span}</a>` : span;
      x += w + (r.code ? 4 : 0);
    }
    t += "</text>";
    out += t;
  });
  return { svg: out, h: boxH };
}

// ─── Cards ────────────────────────────────────────────────────────────────────
// What the canvas card decides once it knows its box: where the icon goes and
// how big, where the label and sub sit. A column, centred, 6px between the
// icon and the text; the text keeps its size and the icon takes the rest.
function cardLayout(p) {
  const innerW = p.w - 2 * PAD, innerH = p.h - 2 * PAD;
  const fs = p.style.fs || 12;
  const subFs = p.style.fs ? Math.round(fs * 0.82) : 10;
  const labelLines = wrapText(p.label, innerW, fs, 700, 2);
  const subLines = p.sub ? wrapText(p.sub, innerW, subFs, 600, 2) : [];
  const textH = labelLines.length * fs * 1.3 + (subLines.length ? 2 + subLines.length * subFs * 1.35 : 0);
  const room = Math.max(0, innerH - GAP - textH); // what the label leaves for the icon
  let icon = null;
  if (p.image || p.icon) {
    if (p.iconSize) {
      // The owner's own size, shrunk (keeping its shape) only when the card
      // has no room for it - object-fit: contain inside max-width/height 100%.
      const k = Math.min(1, innerW / p.iconSize.w, room / p.iconSize.h);
      icon = { w: p.iconSize.w * k, h: p.iconSize.h * k };
    } else {
      icon = { w: innerW, h: room };
    }
  }
  const letterH = !icon && !p.image ? 28 : 0;
  const total = (icon ? icon.h : letterH) + GAP + textH;
  const top = PAD + Math.max(0, (innerH - total) / 2);
  return { innerW, innerH, fs, subFs, labelLines, subLines, textH, icon, letterH, top };
}

function cardSvg(p, i) {
  const L = cardLayout(p);
  const st = p.style;
  const w = p.w, h = p.h;
  const fill = p.sunset ? SUNSET.tint : st.bg ? (st.bg === "transparent" ? "#ffffff" : st.bg) : tint(p.color);
  const bw = st.bw || 1;
  const dash = dashArray(st.bs, bw);
  const labelFill = p.sunset ? SUNSET.ink : "#111827";
  const subFill = p.sunset ? SUNSET.ink : "#6b7280";
  const imgAttrs = p.sunset ? ` filter="url(#sunset-gray)" opacity="0.55"` : "";
  const anchor = st.align === "left" ? "start" : st.align === "right" ? "end" : "middle";
  const tx = st.align === "left" ? PAD : st.align === "right" ? w - PAD : w / 2;
  const family = st.font === "serif" ? ` font-family="Georgia, 'Times New Roman', serif"` : st.font === "mono" ? ` font-family="ui-monospace, Menlo, monospace"` : "";
  const opacity = st.opacity == null ? "" : ` opacity="${st.opacity / 100}"`;
  let out = `<g transform="translate(${f1(p.x)},${f1(p.y)})"${opacity}>`;
  out += `<rect width="${w}" height="${h}" rx="${st.radius || 0}" fill="#ffffff" filter="url(#card-shadow)"/>`;
  out += `<rect width="${w}" height="${h}" rx="${st.radius || 0}" fill="${esc(fill)}" stroke="${esc(p.color)}" stroke-width="${bw}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
  let y = L.top;
  if (L.icon && p.image) {
    // The photo fills its box, cropped (object-fit: cover), corners at 2px.
    const ix = (w - L.icon.w) / 2;
    out += `<clipPath id="pic-${i}"><rect x="${f1(ix)}" y="${f1(y)}" width="${f1(L.icon.w)}" height="${f1(L.icon.h)}" rx="2"/></clipPath>`;
    out += `<image xlink:href="${esc(p.image)}" href="${esc(p.image)}" x="${f1(ix)}" y="${f1(y)}" width="${f1(L.icon.w)}" height="${f1(L.icon.h)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#pic-${i})"${imgAttrs}/>`;
    y += L.icon.h + GAP;
  } else if (L.icon && p.icon) {
    const ix = (w - L.icon.w) / 2;
    out += `<image xlink:href="${esc(p.icon)}" href="${esc(p.icon)}" x="${f1(ix)}" y="${f1(y)}" width="${f1(L.icon.w)}" height="${f1(L.icon.h)}" preserveAspectRatio="xMidYMid meet"${imgAttrs}/>`;
    y += L.icon.h + GAP;
  } else if (L.letterH) {
    // No logo at all: the big first letter the canvas shows.
    out += `<text x="${w / 2}" y="${f1(y + 2 + 24)}" text-anchor="middle" font-size="26" font-weight="700" fill="${esc(p.color)}">${esc(String(p.label || "?")[0].toUpperCase())}</text>`;
    y += L.letterH + GAP;
  }
  L.labelLines.forEach((line, k) => {
    out += `<text x="${f1(tx)}" y="${f1(y + L.fs * 1.3 * k + L.fs * 1.0)}" text-anchor="${anchor}" font-size="${L.fs}" font-weight="700" letter-spacing="-0.1" fill="${esc(labelFill)}"${family}>${esc(line)}</text>`;
  });
  y += L.labelLines.length * L.fs * 1.3;
  if (L.subLines.length) {
    y += 2;
    L.subLines.forEach((line, k) => {
      out += `<text x="${f1(tx)}" y="${f1(y + L.subFs * 1.35 * k + L.subFs * 1.0)}" text-anchor="${anchor}" font-size="${L.subFs}" font-weight="600" fill="${esc(subFill)}"${family}>${esc(line)}</text>`;
    });
  }
  // The i badge at the top-right corner: this card has an explanation.
  if (p.info) {
    out += `<circle cx="${w - 12}" cy="12" r="8" fill="#ffffff" stroke="${esc(p.color)}" stroke-width="1"/>`
      + `<text x="${w - 12}" y="15.5" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-weight="700" font-size="10" fill="${esc(p.color)}">i</text>`;
  }
  if (p.noteLines) {
    const chips = [];
    const block = noteBlock(p.noteLines, w, chips);
    out += `<g transform="translate(0,${h + NOTE_GAP})">${chips.join("")}${block.svg}</g>`;
  }
  out += "</g>";
  return out;
}

// ─── Start pill ───────────────────────────────────────────────────────────────
// The canvas's Start marker: a 132x36 pill with the log-in icon, and a
// connector with an arrowhead on the side that faces the start card. Same
// face-picking as buildMarkers in App.jsx.
const PILL_W = 132, PILL_H = 36;
const NODE_W = 190, NODE_H = 180, MARKER_GAP = 96;

function pillSvg(x, y, dir) {
  const c = START_GREEN;
  const stroke = `stroke="${c}" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"`;
  const connector = {
    down: `<g transform="translate(${PILL_W / 2 - 6},${PILL_H})"><line x1="6" y1="0" x2="6" y2="44" stroke="${c}" stroke-width="1.5"/><path d="M2.5 44 L6 51 L9.5 44" ${stroke}/></g>`,
    up: `<g transform="translate(${PILL_W / 2 - 6},-56)"><line x1="6" y1="56" x2="6" y2="12" stroke="${c}" stroke-width="1.5"/><path d="M2.5 12 L6 5 L9.5 12" ${stroke}/></g>`,
    right: `<g transform="translate(${PILL_W},${PILL_H / 2 - 6})"><line x1="0" y1="6" x2="60" y2="6" stroke="${c}" stroke-width="1.5"/><path d="M60 2.5 L67 6 L60 9.5" ${stroke}/></g>`,
    left: `<g transform="translate(-70,${PILL_H / 2 - 6})"><line x1="70" y1="6" x2="10" y2="6" stroke="${c}" stroke-width="1.5"/><path d="M10 2.5 L3 6 L10 9.5" ${stroke}/></g>`,
  }[dir] || "";
  return `<g transform="translate(${f1(x)},${f1(y)})">${connector}`
    + `<rect x="1" y="1" width="${PILL_W - 2}" height="${PILL_H - 2}" rx="${PILL_H / 2 - 1}" fill="#ffffff" stroke="${c}" stroke-width="2" filter="url(#pill-shadow)"/>`
    + `<circle cx="20" cy="${PILL_H / 2}" r="11" fill="${c}"/>`
    + `<g transform="translate(13.5,11.5) scale(0.5417)" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></g>`
    + `<text x="38" y="${PILL_H / 2 + 4}" font-size="11" font-weight="800" letter-spacing="0.33" fill="${c}">Start here</text></g>`;
}

function startPill(placed, edges, override) {
  if (!placed.length) return "";
  const byId = new Map(placed.map((p) => [p.id, p]));
  const hasIncoming = new Set(edges.map((e) => e.target));
  let s = edges[0] && byId.get(edges[0].source);
  if (!s) s = placed.find((p) => !hasIncoming.has(p.id)) || placed[0];
  const p = { x: s.x, y: s.y };
  const sw = s.size ? s.size.w : NODE_W, sh = s.size ? s.size.h : NODE_H;

  if (override && Number.isFinite(override.x) && Number.isFinite(override.y)) {
    const pillCenter = { x: override.x + 66, y: override.y + 18 };
    const cardCenter = { x: p.x + sw / 2, y: p.y + sh / 2 };
    const dx = cardCenter.x - pillCenter.x, dy = cardCenter.y - pillCenter.y;
    const dir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
    return pillSvg(override.x, override.y, dir);
  }
  const nodeCenter = (n) => ({ x: n.x + NODE_W / 2, y: n.y + NODE_H / 2 });
  const used = new Set();
  const sc = nodeCenter(s);
  for (const e of edges) {
    const otherId = e.source === s.id ? e.target : e.target === s.id ? e.source : null;
    const other = otherId && byId.get(otherId);
    if (!other) continue;
    const oc = nodeCenter(other);
    const dx = oc.x - sc.x, dy = oc.y - sc.y;
    used.add(Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "right" : "left") : (dy >= 0 ? "bottom" : "top"));
  }
  const others = placed.filter((n) => n.id !== s.id);
  const clear = {
    top: !others.some((n) => Math.abs(n.x - p.x) < NODE_W && p.y - n.y > 0 && p.y - n.y < NODE_H + MARKER_GAP),
    bottom: !others.some((n) => Math.abs(n.x - p.x) < NODE_W && n.y - p.y > 0 && n.y - p.y < NODE_H + MARKER_GAP),
    left: !others.some((n) => Math.abs(n.y - p.y) < NODE_H && p.x - n.x > 0 && p.x - n.x < NODE_W + 200),
    right: !others.some((n) => Math.abs(n.y - p.y) < NODE_H && n.x - p.x > 0 && n.x - p.x < NODE_W + 200),
  };
  const order = ["top", "left", "bottom", "right"];
  const side = order.find((k) => !used.has(k) && clear[k]) || order.find((k) => !used.has(k)) || "left";
  const place = {
    top: { x: p.x + 6, y: p.y - MARKER_GAP, dir: "down" },
    bottom: { x: p.x + 6, y: p.y + sh + 40, dir: "up" },
    left: { x: p.x - 200, y: p.y + sh / 2 - 18, dir: "right" },
    right: { x: p.x + 205, y: p.y + sh / 2 - 18, dir: "left" },
  }[side];
  return pillSvg(place.x, place.y, place.dir);
}

// ─── Badges ───────────────────────────────────────────────────────────────────
const BADGE_FS = 8.5, BADGE_H = 17.5;

function badgeSvg(text, cx, cy, mode, c1, c2, sunset, step, gid) {
  const textW = textWidth(text, BADGE_FS, 700);
  const chipW = step != null ? Math.max(12, textWidth(String(step), 8, 800) + 5) : 0;
  const w = 16 + (step != null ? chipW + (text ? 4 : 0) : 0) + textW;
  const x = cx - w / 2, y = cy - BADGE_H / 2;
  let fill, textFill, stroke = "";
  if (sunset) { fill = SUNSET.tint; textFill = SUNSET.ink; stroke = ` stroke="${esc(SUNSET.border)}" stroke-width="1.5"`; }
  else if (mode === "silver") { fill = "#e9ebee"; textFill = "#1e2733"; stroke = ` stroke="url(#${gid})" stroke-width="1.5"`; }
  else if (mode === "color") { fill = `url(#${gid})`; textFill = "#fff"; }
  else if (mode === "plain") { fill = "#e9ebee"; textFill = "#1e2733"; stroke = ` stroke="#c2c6cc" stroke-width="1.5"`; }
  else { fill = "#1c1e21"; textFill = "#fff"; }
  const darkChip = !sunset && (mode === "dark" || mode == null || mode === "color");
  let out = `<g transform="translate(${f1(x)},${f1(y)})"><rect width="${f1(w)}" height="${BADGE_H}" rx="${BADGE_H / 2}" fill="${esc(fill)}"${stroke}/>`;
  let tx = 8;
  if (step != null) {
    out += `<rect x="${tx}" y="${(BADGE_H - 12) / 2}" width="${f1(chipW)}" height="12" rx="6" fill="${darkChip ? "#fff" : "#1c1e21"}"/>`
      + `<text x="${f1(tx + chipW / 2)}" y="${BADGE_H / 2 + 2.9}" text-anchor="middle" font-size="8" font-weight="800" fill="${darkChip ? "#1c1e21" : "#fff"}">${step}</text>`;
    tx += chipW + 4;
  }
  if (text) out += `<text x="${f1(tx)}" y="${f1(BADGE_H / 2 + BADGE_FS * 0.36)}" font-size="${BADGE_FS}" font-weight="700" letter-spacing="0.085" fill="${esc(textFill)}">${esc(text)}</text>`;
  if (sunset) out += sunsetX(w - 5, 5, 6, 3);
  return out + "</g>";
}

// ─── The diagram ──────────────────────────────────────────────────────────────
// opts: { start, view, dotPhase }
//   start    - the owner's placed Start pill {x, y} (view_state.start)
//   view     - the saved view_state: badge mode, panels (steps, notes-off)
//   dotPhase - 0..1, draws the travelling dots and marching dashes for one GIF
//              frame; absent, the still diagram the owner reads (solid lines,
//              no dots), the same as the paused canvas
export function renderDiagramSvg(rawNodes, rawEdges, opts = {}) {
  const view = opts.view || {};
  // layer: "under" (page and grid), "motion" (the dashed lines and dots),
  // "over" (pill, cards, badges) - the GIF rasterises the still layers once
  // and only the motion layer per frame. Absent, the whole picture.
  const layer = opts.layer || null;
  const panels = Array.isArray(view.panels) ? view.panels : view.panel ? [view.panel] : [];
  const showNotes = !panels.includes("notes-off");
  const showSteps = panels.includes("steps");
  const badgeMode = view.badge || "dark";
  const animate = typeof opts.dotPhase === "number";

  const nodes0 = (rawNodes || []).map((n) => {
    const picture = typeof n.image === "string" && n.image.startsWith("data:image/") ? n.image : null;
    const size = n.size && Number.isFinite(n.size.w) && Number.isFinite(n.size.h) ? n.size : null;
    return {
      id: n.id, position: n.position, icon: n.icon, image: picture, label: n.label, color: n.color, sub: n.sub,
      note: cleanNote(n.note), info: typeof n.info === "string" && n.info.trim() ? n.info : "", sunset: n.sunset === true,
      style: n.style && typeof n.style === "object" ? n.style : {},
      size,
      w: size ? size.w : (picture ? PIC_W : CARD),
      h: size ? size.h : (picture ? PIC_H : CARD),
      iconSize: n.iconSize && Number.isFinite(n.iconSize.w) && Number.isFinite(n.iconSize.h) ? n.iconSize : null,
    };
  });
  const edges = rawEdges || [];
  if (!nodes0.length) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" width="200" height="100"><rect width="200" height="100" fill="#fff"/></svg>`;
  }
  const laid = layoutNodes(nodes0, edges);
  const byId = {};
  const placed = laid.map((n) => {
    const svc = findService(n);
    const sunset = n.sunset === true;
    const p = {
      ...n,
      cx: n.x + n.w / 2, cy: n.y + n.h / 2,
      color: sunset ? SUNSET.border : (n.style.stroke || svc.color || INK),
      lineColor: sunset ? SUNSET.border : (svc.color || INK),
      label: svc.label || n.label || n.id, sub: svc.sub || n.sub || "",
      icon: inlineIcon(svc.icon),
      noteLines: showNotes && n.note ? noteLines(n.note, n.w + 2 - 12) : null,
    };
    p.noteH = p.noteLines ? p.noteLines.length * NOTE_LH + 8 + NOTE_GAP + NOTE_CLEAR : 0;
    byId[n.id] = p;
    return p;
  });

  // The routing's view of a card: React Flow's internal node shape.
  const internal = new Map(placed.map((p) => [p.id, { measured: { width: p.w, height: p.h }, internals: { positionAbsolute: { x: p.x, y: p.y } } }]));
  const nodeOf = (id) => internal.get(id) || null;
  const rects = placed.map((p) => ({ id: p.id, x: p.x, y: p.y, w: p.w, h: p.h, noteH: p.noteH }));
  const nodeRects = rects.map(({ x, y, w, h }) => ({ x, y, w, h }));

  let defs = "", edgesSvg = "", dotsSvg = "", labelsSvg = "";
  const extents = [];
  edges.forEach((e, i) => {
    const s = byId[e.source], t = byId[e.target];
    if (!s || !t) return;
    const id = e.id || `e${i}`;
    const sunsetLine = t.sunset || s.sunset;
    const st = e.style && typeof e.style === "object" ? e.style : {};
    const obstacles = rects.filter((r) => r.id !== e.source && r.id !== e.target).map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h + r.noteH }));
    const r = routeEdge({
      id, source: e.source, target: e.target, sourceNode: nodeOf(e.source), targetNode: nodeOf(e.target), nodeOf,
      edges: edges.map((x, k) => ({ id: x.id || `e${k}`, source: x.source, target: x.target })),
      obstacles, nodeRects, bend: e.bend || null, endS: e.ends?.s || null, endT: e.ends?.t || null, arrow: st.arrow,
    });
    const c1 = s.lineColor, c2 = t.lineColor;
    const gid = `grad-${i}`;
    defs += `<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="${f1(r.sx)}" y1="${f1(r.sy)}" x2="${f1(r.tx)}" y2="${f1(r.ty)}"><stop offset="0%" stop-color="${esc(c1)}"/><stop offset="100%" stop-color="${esc(c2)}"/></linearGradient>`;
    // The line, as BaseEdge draws it: a sunset line is flat silver whatever the
    // panel picked; otherwise the picked stroke or the source-to-target
    // gradient, the picked width, dash and opacity. While the dots flow the
    // canvas's animated dash (5 on, 5 off, marching 10px every 0.5s) shows on
    // every line the panel left solid.
    const bw = sunsetLine ? 1.5 : (st.bw || 1.5);
    const picked = sunsetLine ? null : dashArray(st.bs, bw);
    const dash = picked || (animate ? "5" : null);
    const offset = animate && dash ? ` stroke-dashoffset="${f1(10 * (1 - ((opts.dotPhase * 5.2) % 1)))}"` : "";
    const stroke = sunsetLine ? SUNSET.line : (st.stroke || `url(#${gid})`);
    const op = sunsetLine ? 0.75 : (st.opacity == null ? 1 : st.opacity / 100);
    edgesSvg += `<path d="${r.path}" fill="none" stroke="${esc(stroke)}" stroke-width="${bw}"${dash ? ` stroke-dasharray="${dash}"` : ""}${offset}${op !== 1 ? ` opacity="${op}"` : ""}/>`;
    // One frame of the travelling dot, in the SOURCE colour, on the routed path.
    if (animate) {
      const dt = opts.dotPhase % 1; // every dot on the same beat, like offsetFor on the canvas
      const pt = pointAlongPath(r.path, dt);
      if (pt) {
        const fade = Math.min(1, Math.min(dt, 1 - dt) / 0.12);
        dotsSvg += `<g opacity="${fade.toFixed(3)}"><circle cx="${f1(pt.x)}" cy="${f1(pt.y)}" r="5" fill="${esc(c1)}" opacity="0.18"/><circle cx="${f1(pt.x)}" cy="${f1(pt.y)}" r="2.4" fill="${esc(c1)}"/></g>`;
      }
    }
    // The badge: the tag (label, else the description cut short), the step
    // number when Steps is on, at the spot the owner slid it to, else where
    // the routing put it.
    const tag = tagText(e.label, e.description);
    const step = showSteps ? i + 1 : null;
    if (tag || step != null) {
      let bx = r.labelX, by = r.labelY;
      if (typeof e.labelT === "number") {
        const pt = pointAlongPath(r.path, Math.min(T_MAX, Math.max(T_MIN, e.labelT)));
        if (pt) { bx = pt.x; by = pt.y; }
      }
      labelsSvg += badgeSvg(tag, bx, by, badgeMode, c1, c2, sunsetLine, step, gid);
      const bwid = 16 + textWidth(tag, BADGE_FS, 700) + (step != null ? 20 : 0);
      extents.push({ x: bx - bwid / 2, y: by - BADGE_H / 2, w: bwid, h: BADGE_H });
    }
    for (const pt of [{ x: r.sx, y: r.sy }, { x: r.tx, y: r.ty }, { x: r.labelX, y: r.labelYRaw }]) extents.push({ x: pt.x, y: pt.y, w: 0, h: 0 });
  });

  // The arrival glow, as AwsNode paints it: a card the dots run into lights up
  // in its own colour as the phase wraps and fades over 2 s. A ring plus a
  // blurred halo outside the card; the card itself paints over the inside.
  if (animate) {
    const g = glowFor(opts.dotPhase % 1);
    const targets = new Set(edges.map((e) => e.target));
    if (g > 0) {
      defs += `<filter id="glow-blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7"/></filter>`;
      for (const p of placed) {
        if (!targets.has(p.id) || p.sunset) continue;
        const rx = (p.style.radius || 0) + 3;
        const box = `x="${f1(p.x - 3)}" y="${f1(p.y - 3)}" width="${f1(p.w + 6)}" height="${f1(p.h + 6)}" rx="${rx}" fill="none" stroke="${esc(p.color)}"`;
        dotsSvg += `<g class="sd-glow"><rect ${box} stroke-width="${f1(14 * g)}" opacity="${(0.7 * g).toFixed(3)}" filter="url(#glow-blur)"/>`
          + `<rect ${box} stroke-width="${f1(3 * g)}" opacity="${(0.45 * g).toFixed(3)}"/></g>`;
      }
    }
  }

  let nodesSvg = "";
  placed.forEach((p, i) => { nodesSvg += cardSvg(p, i); });

  const markers = startPill(placed, edges, opts.start);

  // The picture is everything drawn plus the canvas's fit padding.
  for (const p of placed) extents.push({ x: p.x, y: p.y, w: p.w, h: p.h + p.noteH });
  if (markers) {
    const m = /translate\(([-\d.]+),([-\d.]+)\)/.exec(markers);
    if (m) extents.push({ x: Number(m[1]) - 70, y: Number(m[2]) - 56, w: PILL_W + 140, h: PILL_H + 112 });
  }
  const FIT = 40;
  const minX = Math.min(...extents.map((r) => r.x)) - FIT;
  const minY = Math.min(...extents.map((r) => r.y)) - FIT;
  const maxX = Math.max(...extents.map((r) => r.x + r.w)) + FIT;
  const maxY = Math.max(...extents.map((r) => r.y + r.h)) + FIT;
  const W = Math.round(maxX - minX), H = Math.round(maxY - minY);

  // The dot grid the canvas sits on, so a still reads as the same page.
  const gridDefs = `<pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse" x="${f1(minX)}" y="${f1(minY)}"><circle cx="1" cy="1" r="0.75" fill="#e6e8eb"/></pattern>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${f1(minX)} ${f1(minY)} ${W} ${H}" width="${W}" height="${H}" font-family="Inter, -apple-system, 'Segoe UI', Arial, sans-serif">`
    + `<defs><filter id="sunset-gray"><feColorMatrix type="saturate" values="0"/></filter>`
    + `<filter id="card-shadow" x="-5%" y="-5%" width="110%" height="115%"><feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="#000000" flood-opacity="0.10"/></filter>`
    + `<filter id="pill-shadow" x="-10%" y="-20%" width="120%" height="160%"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="${START_GREEN}" flood-opacity="0.2"/></filter>`
    + `${gridDefs}${defs}</defs>`
    + (layer === "under" || !layer
      ? `<rect x="${f1(minX)}" y="${f1(minY)}" width="${W}" height="${H}" fill="#ffffff"/>`
        + `<rect x="${f1(minX)}" y="${f1(minY)}" width="${W}" height="${H}" fill="url(#dots)"/>`
      : "")
    + (layer === "motion" || !layer ? `${edgesSvg}${dotsSvg}` : "")
    + (layer === "over" || !layer ? `${markers}${nodesSvg}${labelsSvg}` : "")
    + `</svg>`;
}
