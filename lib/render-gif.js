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
export const GIF_PERIOD_MS = 2600; // matches src/flowClock.js, so both loop alike
// Vercel caps a function's response at 4.5 MB. Frames cost about 0.02 bytes
// per pixel after the palette, so 150 M pixels across all frames stays well
// under it; a taller or wider ask drops frames first, then width.
const PIXEL_BUDGET = 150e6;

/**
 * Render {nodes, edges} to an animated GIF buffer.
 * Frames land at exactly i/N of one period, so the loop closes without a jump.
 */
const TRANSPARENT = 255;

export function renderDiagramGif(nodes, edges, opts = {}) {
  let frames = Math.max(2, Math.min(30, opts.frames || GIF_FRAMES));
  let width = Math.max(200, Math.min(3200, opts.width || GIF_WIDTH));
  // The frame's aspect comes from the still, so the budget can be checked
  // before any frame is rasterised.
  const first = renderDiagramSvg(nodes, edges, { ...opts, dotPhase: 0 });
  const vb = /viewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"/.exec(first);
  const aspect = vb ? Number(vb[2]) / Number(vb[1]) : 0.5;
  while (frames > 10 && frames * width * width * aspect > PIXEL_BUDGET) frames -= 2;
  while (width > 900 && frames * width * width * aspect > PIXEL_BUDGET) width -= 100;
  const delay = Math.round(GIF_PERIOD_MS / frames);

  const gif = GIFEncoder();
  let palette = null, prev = null;
  for (let i = 0; i < frames; i++) {
    const svg = i === 0 ? first : renderDiagramSvg(nodes, edges, { ...opts, dotPhase: i / frames });
    const img = new Resvg(svg, {
      fitTo: { mode: "width", value: width },
      font: fontOpts(),
    })
      .render();
    const { width: w, height: h } = img;
    // resvg hands back RGBA, which is exactly what quantize wants.
    const rgba = img.pixels;
    if (!palette) {
      // 255 colours from the first frame plus one slot kept for "unchanged".
      // It repeats palette[0] so applyPalette never picks it on its own.
      palette = quantize(rgba, 255);
      palette.push([...palette[0]]);
    }
    const index = applyPalette(rgba, palette);
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
