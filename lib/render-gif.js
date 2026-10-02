import { Resvg } from "@resvg/resvg-js";
// gifenc ships CommonJS, and its exported object carries its OWN `default` key.
// So the interop wrapper can leave the real thing one level up or one level down
// depending on the runtime - bare Node ESM and the Next bundler disagree, and
// getting it wrong only surfaces at request time as "GIFEncoder is not a
// function". Rather than bet on a shape, walk down until GIFEncoder is there.
import * as gifencNs from "gifenc";

function resolveGifenc(mod) {
  let cur = mod;
  for (let i = 0; i < 4 && cur; i++) {
    if (typeof cur.GIFEncoder === "function") return cur;
    cur = cur.default;
  }
  throw new Error("gifenc: no GIFEncoder found in the module shape");
}
const { GIFEncoder, quantize, applyPalette } = resolveGifenc(gifencNs);
import { renderDiagramSvg } from "./render-svg.js";
import { fontOpts } from "./resvg-fonts.js";

// Server-side animated GIF of a diagram, so an agent or a README can link one by
// URL. The browser export needs a DOM, html-to-image and an owner session; none
// of that exists here, so the frames are built from the same server SVG renderer
// the ?format=svg export already uses, rasterised with resvg.
//
// The defaults are the app's own GIF export: 20 frames at 130 ms, which is
// the cadence the canvas records, and 1800 px wide, which is the 2x source a
// README column (about 900 px) shows sharp on a retina screen. A 20-node flow
// lands around 700 KB and renders in a few seconds cold, then the CDN holds
// it. ?w= goes up to 3200 for a full-width wiki page. One palette is built
// from the first frame and shared by all of them: the cards and logos are the
// same colours in every frame, and a palette per frame made them shimmer.
export const GIF_FRAMES = 20;
export const GIF_WIDTH = 1800;
export const GIF_PERIOD_MS = 4000; // matches src/flowClock.js, so both loop alike
// Vercel caps a function's response at 4.5 MB. Frames cost about 0.02 bytes
// per pixel after the palette, so 150 M pixels across all frames stays well
// under it; a taller or wider ask drops frames first, then width.
const PIXEL_BUDGET = 150e6;
const TRANSPARENT = 255;

// Straight-alpha "over": src on top of dst, both RGBA8, dst opaque or not.
function over(dst, src, p, out, q) {
  const a = src[p + 3];
  if (a === 0) return;
  if (a === 255) { out[q] = src[p]; out[q + 1] = src[p + 1]; out[q + 2] = src[p + 2]; out[q + 3] = 255; return; }
  const da = dst[q + 3], k = 255 - a;
  const oa = a + (da * k) / 255;
  for (let c = 0; c < 3; c++) out[q + c] = (src[p + c] * a + dst[q + c] * da * k / 255) / oa;
  out[q + 3] = oa;
}

function raster(svg, width, font) {
  return new Resvg(svg, { fitTo: { mode: "width", value: width }, font }).render();
}


/**
 * Render {nodes, edges} to an animated GIF buffer.
 * Frames land at exactly i/N of one period, so the loop closes without a jump.
 *
 * Rasterising a full frame is nearly all of the cost (about 250 ms at 1800 px,
 * 3 ms for the lines alone), and only the dashes and dots move. So the page
 * and the cards are rasterised once each, and every frame is the moving
 * layer composited between them: under, then motion, then over.
 */
export function renderDiagramGif(nodes, edges, opts = {}) {
  let frames = Math.max(2, Math.min(30, opts.frames || GIF_FRAMES));
  let width = Math.max(200, Math.min(3200, opts.width || GIF_WIDTH));
  // The frame's aspect comes from the still, so the budget can be checked
  // before any frame is rasterised.
  const underSvg = renderDiagramSvg(nodes, edges, { ...opts, dotPhase: 0, layer: "under" });
  const vb = /viewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"/.exec(underSvg);
  const aspect = vb ? Number(vb[2]) / Number(vb[1]) : 0.5;
  while (frames > 10 && frames * width * width * aspect > PIXEL_BUDGET) frames -= 2;
  while (width > 900 && frames * width * width * aspect > PIXEL_BUDGET) width -= 100;
  const delay = Math.round(GIF_PERIOD_MS / frames);

  const fonts = fontOpts();
  const under = raster(underSvg, width, fonts);
  const overImg = raster(renderDiagramSvg(nodes, edges, { ...opts, dotPhase: 0, layer: "over" }), width, fonts);
  const { width: w, height: h } = under;
  const u = under.pixels, o = overImg.pixels;
  // The still picture: cards over the page. Every frame starts from it.
  const base = new Uint8Array(u.length);
  for (let q = 0; q < u.length; q += 4) { base[q] = u[q]; base[q + 1] = u[q + 1]; base[q + 2] = u[q + 2]; base[q + 3] = 255; over(base, o, q, base, q); }

  const gif = GIFEncoder();
  let palette = null, prev = null;
  const frame = new Uint8Array(u.length);
  const noFonts = { loadSystemFonts: false };
  for (let i = 0; i < frames; i++) {
    const m = raster(renderDiagramSvg(nodes, edges, { ...opts, dotPhase: i / frames, layer: "motion" }), width, noFonts).pixels;
    frame.set(base);
    for (let q = 0; q < m.length; q += 4) {
      if (m[q + 3] === 0) continue;
      // A moving pixel under a card or its shadow: page, then line, then card.
      over(u, m, q, frame, q);
      if (o[q + 3] !== 0) over(frame, o, q, frame, q);
    }
    if (!palette) {
      // 255 colours from the first frame plus one slot kept for "unchanged".
      // It repeats palette[0] so applyPalette never picks it on its own.
      palette = quantize(frame, 255);
      palette.push([...palette[0]]);
    }
    const index = applyPalette(frame, palette);
    if (!prev) {
      gif.writeFrame(index, w, h, { palette, delay, dispose: 1 });
    } else {
      // Only the dashes and dots move between frames, so every pixel that
      // matches the frame before is written as transparent over it. That
      // is what keeps a 1800 px, 20 frame GIF small enough for a README.
      const diff = new Uint8Array(index.length);
      for (let p = 0; p < index.length; p++) diff[p] = index[p] === prev[p] ? TRANSPARENT : index[p];
      gif.writeFrame(diff, w, h, { palette, delay, dispose: 1, transparent: true, transparentIndex: TRANSPARENT });
    }
    prev = index;
  }
  gif.finish();
  return Buffer.from(gif.bytes());
}
