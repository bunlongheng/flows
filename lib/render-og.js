// Builds the 1200x630 share card for one saved design: the diagram, near
// full-bleed, plus a brand mark and a couple of chips.
//
// Deliberately NO title and NO description. Every platform renders og:title and
// og:description as its own chrome directly under the image, so drawing them
// here showed the title twice. The image's job is the diagram itself.
//
// The whole card is ONE SVG - the diagram SVG that lib/render-svg.js already
// produces is nested inside it as a child <svg> with its own viewBox, so it
// scales to fit without re-laying anything out. A single SVG means a single
// resvg rasterise, no compositing step.
import { renderDiagramSvg } from "./render-svg.js";
import iconManifest from "./icon-data.js";
import { BRANDS } from "../src/brands.js";
import { tierFor } from "../src/difficulty.js";

export const OG_W = 1200;
export const OG_H = 630;

const PAD = 52;
const CARD_Y = 112; // top of the white diagram card
const CARD_H = OG_H - CARD_Y - PAD;

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

function chip(x, y, label, fill, stroke, ink) {
  const w = label.length * 7.4 + 26;
  return (
    `<rect x="${x}" y="${y}" width="${w.toFixed(1)}" height="30" rx="15" fill="${fill}" stroke="${stroke}"/>` +
    `<text x="${(x + w / 2).toFixed(1)}" y="${y + 20}" font-size="14" font-weight="700" fill="${ink}" text-anchor="middle">${esc(label)}</text>`
  );
}

// Pulls the diagram SVG apart just far enough to re-emit it as a nested <svg>
// sized to the preview card. preserveAspectRatio does the letterboxing.
function nestDiagram(nodes, edges, x, y, w, h) {
  let inner;
  try {
    inner = renderDiagramSvg(nodes, edges, { destination: false });
  } catch {
    return "";
  }
  const vb = /viewBox="([^"]+)"/.exec(inner);
  if (!vb) return "";
  const body = inner.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  return (
    `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${vb[1]}" ` +
    `preserveAspectRatio="xMidYMid meet" font-family="Roboto, Inter, sans-serif">${body}</svg>`
  );
}

/**
 * @param {object} design - { title, pattern, description, nodes, edges, difficulty }
 * @returns {string} a self-contained 1200x630 SVG
 */
export function renderOgSvg(design = {}) {
  const nodes = Array.isArray(design.nodes) ? design.nodes : [];
  const edges = Array.isArray(design.edges) ? design.edges : [];
  const logo = brandIcon(design.title);

  const P = [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" `,
    `width="${OG_W}" height="${OG_H}" viewBox="0 0 ${OG_W} ${OG_H}" font-family="Roboto, Inter, sans-serif">`,
    `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">`,
    `<stop offset="0" stop-color="#fbfcfd"/><stop offset="1" stop-color="#eceff3"/></linearGradient></defs>`,
    `<rect width="${OG_W}" height="${OG_H}" fill="url(#bg)"/>`,
  ];

  // The design's real-world mark, if it has one. No wordmark next to it: the
  // platform prints the name underneath.
  if (logo) {
    P.push(`<image x="${PAD}" y="46" width="44" height="44" href="${esc(logo)}" preserveAspectRatio="xMidYMid meet"/>`);
  } else {
    P.push(`<text x="${PAD}" y="80" font-size="14" font-weight="700" fill="#9aa0a6" letter-spacing="2.6">FLOWS</text>`);
  }

  // Chips, right-aligned on the same row.
  const chips = [];
  const tier = tierFor(design.difficulty);
  if (tier) chips.push([tier.label, tier.bg, tier.bd, tier.fg]);
  chips.push([`${nodes.length} nodes`, "#ffffff", "#d5dae1", "#5b6169"]);
  chips.push([`${edges.length} edges`, "#ffffff", "#d5dae1", "#5b6169"]);
  let cx = OG_W - PAD;
  for (const [label, fill, stroke, ink] of chips.reverse()) {
    const w = label.length * 7.4 + 26;
    cx -= w;
    P.push(chip(cx, 53, label, fill, stroke, ink));
    cx -= 8;
  }

  // The diagram, given the rest of the frame.
  P.push(
    `<rect x="${PAD}" y="${CARD_Y}" width="${OG_W - PAD * 2}" height="${CARD_H}" rx="16" fill="#ffffff" stroke="#d5dae1"/>`,
  );
  P.push(nestDiagram(nodes, edges, PAD + 18, CARD_Y + 16, OG_W - PAD * 2 - 36, CARD_H - 32));
  P.push(`</svg>`);
  return P.join("");
}
