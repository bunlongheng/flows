// Builds the 1200x630 share card for one saved design. Same shape as the
// Stickies card: brand, the title big, a line of context, chips, and the real
// content - here a readable window onto the diagram itself.
//
// The title IS drawn on the image. Platforms do print og:title under the
// image, but small and grey; the picture is what a recipient actually looks
// at, and a picture with no name on it reads as a random screenshot.
//
// The whole card is ONE SVG - the diagram SVG that lib/render-svg.js already
// produces is nested inside it as a child <svg> with its own viewBox, so it
// scales without re-laying anything out. A single SVG means a single resvg
// rasterise, no compositing step.
import { renderDiagramSvg } from "./render-svg.js";
import iconManifest from "./icon-data.js";
import appIcon from "./app-icon-data.js";
import { BRANDS } from "../src/brands.js";
import { tierFor } from "../src/difficulty.js";

export const OG_W = 1200;
export const OG_H = 630;

const PAD = 56;
const COL_W = 440;                 // text column
const PANEL_X = PAD + COL_W + 44;  // diagram panel
const PANEL_Y = PAD;
const PANEL_W = OG_W - PANEL_X - PAD;
const PANEL_H = OG_H - PAD * 2;

// A node card in the diagram SVG is 158px wide. Below about a third the label is no
// longer legible and the diagram is a smudge, so the window zooms in and shows
// the middle of the design instead of all of it at postage-stamp size.
const MIN_SCALE = 0.34;
const MAX_SCALE = 1;

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

// The demo's real-world logo (Mailchimp, Stripe, ...) when the title has one.
// Keyed the same way the gallery card keys it, and resolved through the icon
// manifest so it inlines as a data URI with no filesystem read.
function brandIcon(title) {
  const b = BRANDS[String(title || "").trim().toLowerCase()];
  return b && iconManifest[b.icon] ? iconManifest[b.icon] : null;
}

// Roboto has no metrics at render time, so widths are estimated per glyph
// class. Wide enough to never overflow the column; a little ragged is fine.
function textWidth(s, size, bold) {
  let w = 0;
  for (const ch of String(s)) {
    if (/[ .,:;'|!il1jt]/.test(ch)) w += 0.3;
    else if (/[A-Z0-9]/.test(ch)) w += bold ? 0.68 : 0.64;
    else if (/[mwMW]/.test(ch)) w += 0.9;
    else w += bold ? 0.56 : 0.52;
  }
  return w * size;
}

export function wrap(text, size, maxW, maxLines, bold = true) {
  const words = String(text ?? "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (textWidth(next, size, bold) <= maxW || !cur) cur = next;
    else { lines.push(cur); cur = word; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (textWidth(`${last}…`, size, bold) > maxW && last.includes(" ")) last = last.slice(0, last.lastIndexOf(" "));
    kept[maxLines - 1] = `${last}…`;
    return kept;
  }
  return lines;
}

function chip(x, y, label, fill, stroke, ink) {
  const w = textWidth(label, 14, true) + 28;
  return {
    w,
    svg:
      `<rect x="${x.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="32" rx="16" fill="${fill}" stroke="${stroke}"/>` +
      `<text x="${(x + w / 2).toFixed(1)}" y="${y + 21}" font-size="14" font-weight="700" fill="${ink}" text-anchor="middle">${esc(label)}</text>`,
  };
}

// Where the window onto the diagram is centred: the middle of the nodes, not
// of the bounding box, so a lone outlier does not drag the view into empty
// space. Falls back to the box centre when nodes carry no positions.
function focus(nodes, vb) {
  const pts = nodes.filter((n) => n?.position && Number.isFinite(n.position.x) && Number.isFinite(n.position.y));
  if (!pts.length) return { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 };
  return {
    x: pts.reduce((a, n) => a + n.position.x, 0) / pts.length + 79,
    y: pts.reduce((a, n) => a + n.position.y, 0) / pts.length + 47,
  };
}

// Re-emits the diagram SVG as a nested <svg> whose viewBox is a window sized
// so the nodes stay readable: the whole design when it fits at a legible
// scale, otherwise a zoomed-in centre crop.
function nestDiagram(nodes, edges, x, y, w, h) {
  let inner;
  try {
    inner = renderDiagramSvg(nodes, edges, { destination: false });
  } catch {
    return "";
  }
  const m = /viewBox="([^"]+)"/.exec(inner);
  if (!m) return "";
  const [vx, vy, vw, vh] = m[1].split(/\s+/).map(Number);
  const vb = { x: vx, y: vy, w: vw, h: vh };
  const meet = Math.min(w / vw, h / vh);
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, meet));
  const winW = w / scale, winH = h / scale;
  let cx, cy;
  if (scale === meet) { cx = vx + vw / 2; cy = vy + vh / 2; }
  else {
    const f = focus(nodes, vb);
    // Keep the window inside the drawing where it can be; a window wider than
    // the drawing just centres on it.
    cx = winW >= vw ? vx + vw / 2 : Math.min(Math.max(f.x, vx + winW / 2), vx + vw - winW / 2);
    cy = winH >= vh ? vy + vh / 2 : Math.min(Math.max(f.y, vy + winH / 2), vy + vh - winH / 2);
  }
  const body = inner.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  return (
    `<svg x="${x}" y="${y}" width="${w}" height="${h}" ` +
    `viewBox="${(cx - winW / 2).toFixed(1)} ${(cy - winH / 2).toFixed(1)} ${winW.toFixed(1)} ${winH.toFixed(1)}" ` +
    `preserveAspectRatio="xMidYMid meet" font-family="Roboto, Inter, sans-serif">${body}</svg>`
  );
}

function frame() {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" `,
    `width="${OG_W}" height="${OG_H}" viewBox="0 0 ${OG_W} ${OG_H}" font-family="Roboto, Inter, sans-serif">`,
    `<defs>`,
    `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbfcfd"/><stop offset="1" stop-color="#e9edf3"/></linearGradient>`,
    `<clipPath id="panel"><rect x="${PANEL_X}" y="${PANEL_Y}" width="${PANEL_W}" height="${PANEL_H}" rx="20"/></clipPath>`,
    `</defs>`,
    `<rect width="${OG_W}" height="${OG_H}" fill="url(#bg)"/>`,
  ];
}

function brandRow(P, logo) {
  P.push(`<image x="${PAD}" y="${PAD}" width="40" height="40" href="${esc(logo || appIcon)}" preserveAspectRatio="xMidYMid meet"/>`);
  P.push(`<text x="${PAD + 54}" y="${PAD + 28}" font-size="18" font-weight="700" fill="#8a919a" letter-spacing="4">FLOWS</text>`);
}

/**
 * @param {object} design - { title, pattern, description, nodes, edges, difficulty }
 * @returns {string} a self-contained 1200x630 SVG
 */
export function renderOgSvg(design = {}) {
  const nodes = Array.isArray(design.nodes) ? design.nodes : [];
  const edges = Array.isArray(design.edges) ? design.edges : [];
  const title = String(design.title || "Untitled diagram").trim();
  const context = String(design.pattern || design.description || "").trim();

  const P = frame();
  brandRow(P, brandIcon(design.title));

  // Title: as big as the column allows, at most 3 lines.
  const size = title.length <= 22 ? 54 : title.length <= 44 ? 44 : 36;
  const lines = wrap(title, size, COL_W, 3);
  const titleY = 176;
  const lineH = size * 1.14;
  lines.forEach((l, i) => {
    P.push(`<text x="${PAD}" y="${(titleY + i * lineH).toFixed(1)}" font-size="${size}" font-weight="700" fill="#16191d" letter-spacing="-0.5">${esc(l)}</text>`);
  });

  // Context line under the title: the pattern (or description), 2 lines max.
  let y = titleY + (lines.length - 1) * lineH + 40;
  if (context) {
    for (const l of wrap(context, 20, COL_W, 2, false)) {
      P.push(`<text x="${PAD}" y="${y.toFixed(1)}" font-size="20" fill="#5b6169">${esc(l)}</text>`);
      y += 29;
    }
  }

  // Chips pinned to the bottom of the column.
  const chips = [];
  const tier = tierFor(design.difficulty);
  if (tier) chips.push([tier.label, tier.bg, tier.bd, tier.fg]);
  chips.push([`${nodes.length} nodes`, "#ffffff", "#d5dae1", "#5b6169"]);
  chips.push([`${edges.length} edges`, "#ffffff", "#d5dae1", "#5b6169"]);
  let cx = PAD;
  for (const [label, fill, stroke, ink] of chips) {
    const c = chip(cx, OG_H - PAD - 32, label, fill, stroke, ink);
    P.push(c.svg);
    cx += c.w + 8;
  }

  // The diagram panel.
  P.push(`<rect x="${PANEL_X}" y="${PANEL_Y}" width="${PANEL_W}" height="${PANEL_H}" rx="20" fill="#ffffff" stroke="#d5dae1"/>`);
  P.push(`<g clip-path="url(#panel)">`);
  P.push(nestDiagram(nodes, edges, PANEL_X + 8, PANEL_Y + 8, PANEL_W - 16, PANEL_H - 16));
  P.push(`</g>`);
  P.push(`</svg>`);
  return P.join("");
}

// The site's own card: what a link to the home page, a private design, or a
// stale link previews as. Same frame, no diagram.
export function renderSiteOgSvg() {
  const P = frame();
  P.push(`<image x="${(OG_W - 132) / 2}" y="150" width="132" height="132" href="${esc(appIcon)}" preserveAspectRatio="xMidYMid meet"/>`);
  P.push(`<text x="${OG_W / 2}" y="372" font-size="64" font-weight="700" fill="#16191d" text-anchor="middle" letter-spacing="-1">Flows</text>`);
  P.push(`<text x="${OG_W / 2}" y="426" font-size="24" fill="#5b6169" text-anchor="middle">Interactive AWS &amp; GCP architecture diagrams</text>`);
  P.push(`</svg>`);
  return P.join("");
}
