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
// Cost control matters: this is N rasterises in one request, not one. 14 frames
// at 900px is roughly a second of work and lands around 400KB - enough to read
// as motion without turning a README into a download. A GIF is 256 paletted
// colours anyway, so a wider raster buys banding, not detail.
export const GIF_FRAMES = 14;
export const GIF_WIDTH = 900;
export const GIF_PERIOD_MS = 2600; // matches src/flowClock.js, so both loop alike

/**
 * Render {nodes, edges} to an animated GIF buffer.
 * Frames land at exactly i/N of one period, so the loop closes without a jump.
 */
export function renderDiagramGif(nodes, edges, opts = {}) {
  const frames = Math.max(2, Math.min(30, opts.frames || GIF_FRAMES));
  const width = Math.max(200, Math.min(1600, opts.width || GIF_WIDTH));
  const delay = Math.round(GIF_PERIOD_MS / frames);

  const gif = GIFEncoder();
  for (let i = 0; i < frames; i++) {
    const svg = renderDiagramSvg(nodes, edges, { ...opts, dotPhase: i / frames });
    const img = new Resvg(svg, {
      fitTo: { mode: "width", value: width },
      font: fontOpts(),
    })
      .render();
    const { width: w, height: h } = img;
    // resvg hands back RGBA, which is exactly what quantize wants.
    const rgba = img.pixels;
    const palette = quantize(rgba, 256);
    gif.writeFrame(applyPalette(rgba, palette), w, h, { palette, delay });
  }
  gif.finish();
  return Buffer.from(gif.bytes());
}
