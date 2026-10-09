import { describe, it, expect } from "vitest";
import { renderDiagramGif, over } from "../../lib/render-gif.js";
import { renderDiagramSvg } from "../../lib/render-svg.js";
import { STEP_MS, AMBIENT_DOTS } from "../../src/flowClock.js";

// The server-side GIF is what an agent or a README gets from ?format=gif. It
// exists because the in-app export needs a DOM, html-to-image and an owner
// session, none of which a headless caller has.

const NODES = [
  { id: "user", position: { x: 0, y: 0 } },
  { id: "apigw", position: { x: 320, y: 0 } },
  { id: "lambda", position: { x: 640, y: 0 } },
];
const EDGES = [
  { id: "e0", source: "user", target: "apigw" },
  { id: "e1", source: "apigw", target: "lambda" },
];

/** Walk a GIF and hash each frame's compressed image data. */
function frames(buf) {
  const d = Uint8Array.from(buf);
  let i = 13;
  if (d[10] & 0x80) i += 3 * 2 ** ((d[10] & 7) + 1);
  const skip = (j) => { while (d[j] !== 0) j += 1 + d[j]; return j + 1; };
  const out = [];
  while (i < d.length && d[i] !== 0x3b) {
    if (d[i] === 0x21) i = skip(i + 2);
    else if (d[i] === 0x2c) {
      const lf = d[9 + i];
      let j = i + 10;
      if (lf & 0x80) j += 3 * 2 ** ((lf & 7) + 1);
      j += 1;
      const start = j;
      j = skip(j);
      out.push(d.slice(start, j).join(","));
      i = j;
    } else break;
  }
  return out;
}

describe("renderDiagramSvg dotPhase", () => {
  it("draws no dot unless a phase is asked for", () => {
    const plain = renderDiagramSvg(NODES, EDGES);
    const dotted = renderDiagramSvg(NODES, EDGES, { dotPhase: 0.4 });
    // Two circles (glow + core) for the ONE line carrying the big current,
    // plus the small ambient dots (halo + core each) every line carries.
    const n = (s) => (s.match(/<circle/g) || []).length;
    expect(n(dotted) - n(plain)).toBe(2 + EDGES.length * AMBIENT_DOTS * 2);
  });

  it("moves the dot as the phase advances", () => {
    expect(renderDiagramSvg(NODES, EDGES, { dotPhase: 0.15 }))
      .not.toBe(renderDiagramSvg(NODES, EDGES, { dotPhase: 0.65 }));
  });

  it("puts 1 dot on the frame, so a reader can see which step is live", () => {
    // Each line gets its own slot in the cycle, walked in the order the Steps
    // badges number them. Every frame carries exactly 1 dot, whatever the
    // phase, so nobody has to guess which of 20 lines is the live one.
    for (const dotPhase of [0.1, 0.4, 0.6, 0.95]) {
      const svg = renderDiagramSvg(NODES, EDGES, { dotPhase });
      const dots = svg.match(/<circle cx="[\d.]+" cy="[\d.]+" r="7"/g) || [];
      expect(dots).toHaveLength(1);
    }
  });
});

describe("renderDiagramSvg layers", () => {
  // The GIF rasterises the page and the cards once and only the moving lines
  // per frame, so the three layers together must be exactly the full picture.
  it("under + motion + over is the whole frame, in that order", () => {
    const o = { dotPhase: 0.3 };
    const body = (svg) => svg.slice(svg.indexOf("</defs>") + 7, svg.lastIndexOf("</svg>"));
    const full = renderDiagramSvg(NODES, EDGES, o);
    const under = renderDiagramSvg(NODES, EDGES, { ...o, layer: "under" });
    const motion = renderDiagramSvg(NODES, EDGES, { ...o, layer: "motion" });
    const over = renderDiagramSvg(NODES, EDGES, { ...o, layer: "over" });
    expect(body(under) + body(motion) + body(over)).toBe(body(full));
    // Same viewBox on every layer, or the composite would not line up.
    const vb = (svg) => /viewBox="([^"]+)"/.exec(svg)[1];
    expect(new Set([vb(full), vb(under), vb(motion), vb(over)]).size).toBe(1);
    expect(under).not.toContain("<path");
    expect(motion).not.toContain('fill="#ffffff"');
    expect(over).toContain("Start here");
  });
});

describe("renderDiagramGif", () => {
  it("returns a looping GIF89a", async () => {
    const buf = await renderDiagramGif(NODES, EDGES, { frames: 6, width: 400 });
    expect(buf.subarray(0, 6).toString("ascii")).toBe("GIF89a");
    expect(buf.includes(Buffer.from("NETSCAPE2.0"))).toBe(true);
  });

  it("writes the frame count asked for, and they are not all the same", async () => {
    const f = frames(await renderDiagramGif(NODES, EDGES, { frames: 8, width: 400 }));
    expect(f).toHaveLength(8);
    // A GIF whose frames are identical is the exact failure this whole approach
    // exists to avoid, so assert motion rather than just a frame count.
    expect(new Set(f).size).toBeGreaterThan(1);
  });

  it("clamps frames and width so one request cannot ask for an enormous render", async () => {
    expect(frames(await renderDiagramGif(NODES, EDGES, { frames: 999, width: 400 })).length)
      .toBeLessThanOrEqual(250);
    expect(frames(await renderDiagramGif(NODES, EDGES, { frames: 1, width: 400 })).length)
      .toBeGreaterThanOrEqual(2);
  });

  it("writes frames after the first as a transparent diff over the one before", async () => {
    const f = frames(await renderDiagramGif(NODES, EDGES, { frames: 6, width: 400 }));
    const size = (s) => s.split(",").length;
    // Only the dashes and dots move, so every later frame is a fraction of the first.
    for (let i = 1; i < f.length; i++) expect(size(f[i])).toBeLessThan(size(f[0]) / 3);
  });

  it("is full HD at 20 fps by default and still fits a README", async () => {
    const buf = await renderDiagramGif(NODES, EDGES, {});
    expect(buf.readUInt16LE(6)).toBe(1920);
    // Delay is stored in 1/100 s: 50 ms is 5, exactly, so the loop keeps time.
    expect(buf[buf.indexOf("\x21\xF9\x04", 0, "latin1") + 4]).toBe(5);
    expect(buf.length).toBeLessThan(4.3e6);
  });

  // The export exists to show what the canvas shows. src/flowClock.js walks ONE
  // line per STEP_MS whatever the diagram's size, so the GIF has to as well:
  // the old code pinned the whole walk to a flat 5 s, which ran an 11 line
  // diagram 3.1x too fast and a 56 line one 15.7x. Assert the pace, not the
  // frame count - the budget guards are free to spend frames, never speed.
  it("walks 1 line per STEP_MS, the same as the canvas clock", async () => {
    for (const n of [2, 5]) {
      const edges = Array.from({ length: n }, (_, i) => ({
        id: `e${i}`, source: NODES[i % 3].id, target: NODES[(i + 1) % 3].id,
      }));
      const buf = await renderDiagramGif(NODES, edges, { width: 320 });
      const f = frames(buf);
      const cs = buf[buf.indexOf("\x21\xF9\x04", 0, "latin1") + 4];
      const msPerLine = (f.length * cs * 10) / n;
      expect(msPerLine).toBeGreaterThan(STEP_MS * 0.9);
      expect(msPerLine).toBeLessThan(STEP_MS * 1.1);
    }
  });

  it("survives a diagram with no edges", async () => {
    const buf = await renderDiagramGif([NODES[0]], [], { frames: 3, width: 300 });
    expect(buf.subarray(0, 3).toString("ascii")).toBe("GIF");
  });

  it("renders a picture node", async () => {
    const img = { id: "shot", position: { x: 0, y: 0 }, image: "data:image/jpeg;base64,/9j/4AAQSkZJRg==", label: "Checkout page" };
    const buf = await renderDiagramGif([img], [], { frames: 3, width: 300 });
    expect(buf.subarray(0, 4).toString("ascii")).toBe("GIF8");
  });
});

describe("over", () => {
  it("keeps the colour of a half-transparent premultiplied pixel instead of darkening it", () => {
    // Purple #7B61FF at alpha 0.5, as resvg stores it: colour already halved.
    const src = new Uint8Array([62, 49, 128, 128]);
    const dst = new Uint8Array([255, 255, 255, 255]);
    const out = new Uint8Array(4);
    over(dst, src, 0, out, 0);
    // Half purple over white is pale purple, blue well above red and green.
    expect(out[3]).toBe(255);
    expect(out[2]).toBeGreaterThan(240);
    expect(out[0]).toBeGreaterThan(180);
    expect(out[0]).toBeLessThan(200);
  });
});
