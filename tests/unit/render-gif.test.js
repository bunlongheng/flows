import { describe, it, expect } from "vitest";
import { renderDiagramGif } from "../../lib/render-gif.js";
import { renderDiagramSvg } from "../../lib/render-svg.js";

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
    // Two circles per edge (glow + core) on top of whatever the plain frame has.
    const n = (s) => (s.match(/<circle/g) || []).length;
    expect(n(dotted) - n(plain)).toBe(EDGES.length * 2);
  });

  it("moves the dot as the phase advances", () => {
    expect(renderDiagramSvg(NODES, EDGES, { dotPhase: 0.15 }))
      .not.toBe(renderDiagramSvg(NODES, EDGES, { dotPhase: 0.65 }));
  });

  it("staggers edges so a frame reads as flow, not a pulse", () => {
    const svg = renderDiagramSvg(NODES, EDGES, { dotPhase: 0.3 });
    const cx = [...svg.matchAll(/<circle cx="([\d.]+)"/g)].map((m) => m[1]);
    expect(new Set(cx).size).toBeGreaterThan(1);
  });
});

describe("renderDiagramGif", () => {
  it("returns a looping GIF89a", () => {
    const buf = renderDiagramGif(NODES, EDGES, { frames: 6, width: 400 });
    expect(buf.subarray(0, 6).toString("ascii")).toBe("GIF89a");
    expect(buf.includes(Buffer.from("NETSCAPE2.0"))).toBe(true);
  });

  it("writes the frame count asked for, and they are not all the same", () => {
    const f = frames(renderDiagramGif(NODES, EDGES, { frames: 8, width: 400 }));
    expect(f).toHaveLength(8);
    // A GIF whose frames are identical is the exact failure this whole approach
    // exists to avoid, so assert motion rather than just a frame count.
    expect(new Set(f).size).toBeGreaterThan(1);
  });

  it("clamps frames and width so one request cannot ask for an enormous render", () => {
    expect(frames(renderDiagramGif(NODES, EDGES, { frames: 999, width: 400 })).length)
      .toBeLessThanOrEqual(30);
    expect(frames(renderDiagramGif(NODES, EDGES, { frames: 1, width: 400 })).length)
      .toBeGreaterThanOrEqual(2);
  });

  it("survives a diagram with no edges", () => {
    const buf = renderDiagramGif([NODES[0]], [], { frames: 3, width: 300 });
    expect(buf.subarray(0, 3).toString("ascii")).toBe("GIF");
  });
});
