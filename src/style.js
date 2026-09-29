// The per-node and per-edge look, as the format panel writes it and as every
// renderer reads it. It is modelled on Excalidraw's properties panel, minus the
// two controls that only mean something to a rough.js canvas: Fill (hachure /
// cross-hatch / solid) and Sloppiness. A Flows card is a real DOM element, so
// there is no hand-drawn stroke to make sloppy and no hatching to fill it with -
// offering either would be a control that does nothing.
//
// One module, because the API has to validate exactly what the panel can send.
// A style arrives from the browser and is stored verbatim in jsonb, so nothing
// gets in here that a renderer has not been taught to draw.

// Excalidraw's own top-row picks, so a diagram carried between the two tools
// keeps its palette (packages/excalidraw/colors.ts).
export const STROKE_PICKS = ["#1e1e1e", "#e03131", "#2f9e44", "#1971c2", "#f08c00"];
export const BG_PICKS = ["transparent", "#ffc9c9", "#b2f2bb", "#a5d8ff", "#ffec99"];

export const BORDER_WIDTHS = [1, 2, 4];
export const BORDER_STYLES = ["solid", "dashed", "dotted"];
export const RADII = [0, 12];
export const FONTS = ["sans", "serif", "mono"];
export const FONT_SIZES = [12, 14, 18, 24];
export const ALIGNS = ["left", "center", "right"];

export const FONT_STACK = {
  sans: "inherit",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
};

// Dash patterns in SVG stroke-dasharray units, scaled by the border width so a
// 4px dashed border does not read as solid.
export const dashArray = (style, w = 1) =>
  style === "dashed" ? `${w * 5} ${w * 3}` : style === "dotted" ? `${w} ${w * 2.5}` : null;

// The CSS equivalent, for the DOM card.
export const borderStyleOf = (s) => (BORDER_STYLES.includes(s) ? s : "solid");

const hex = (c) => (typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : null);
const pick = (v, allowed) => (allowed.includes(v) ? v : null);

// Returns a style object carrying ONLY the keys that were set and are legal, or
// null when nothing survives - so an untouched node stores no style key at all
// and a flow written before this existed reads back identically.
export function cleanStyle(s) {
  if (!s || typeof s !== "object" || Array.isArray(s)) return null;
  const out = {};
  const stroke = hex(s.stroke);
  if (stroke) out.stroke = stroke;
  const bg = s.bg === "transparent" ? "transparent" : hex(s.bg);
  if (bg) out.bg = bg;
  const bw = pick(s.bw, BORDER_WIDTHS);
  if (bw) out.bw = bw;
  const bs = pick(s.bs, BORDER_STYLES);
  if (bs) out.bs = bs;
  // 0 is a real radius, so this one cannot lean on truthiness.
  const radius = pick(s.radius, RADII);
  if (radius != null) out.radius = radius;
  const font = pick(s.font, FONTS);
  if (font) out.font = font;
  const fs = pick(s.fs, FONT_SIZES);
  if (fs) out.fs = fs;
  const align = pick(s.align, ALIGNS);
  if (align) out.align = align;
  // A slider, so it is a range rather than a pick - and 0 is legal (invisible
  // on purpose is a thing people do).
  if (Number.isFinite(s.opacity)) out.opacity = Math.max(0, Math.min(100, Math.round(s.opacity)));
  return Object.keys(out).length ? out : null;
}
