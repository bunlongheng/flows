import { describe, it, expect } from "vitest";
import { ringIsWhite, detectIconFrame } from "../../lib/icon-frame.js";
import { renderDiagramSvg } from "../../lib/render-svg.js";

// A 20x20 RGBA buffer painted by a function of (x, y).
const raster = (w, h, px) => {
  const d = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set(px(x, y), (y * w + x) * 4);
  return d;
};
const edge = (x, y, w, h, m) => x < m || y < m || x >= w - m || y >= h - m;

describe("ringIsWhite", () => {
  it("is true for a white tile with a dark centre, false for a dark tile", () => {
    expect(ringIsWhite(raster(20, 20, (x, y) => (edge(x, y, 20, 20, 4) ? [255, 255, 255, 255] : [20, 20, 20, 255])), 20, 20)).toBe(true);
    expect(ringIsWhite(raster(20, 20, () => [30, 30, 30, 255]), 20, 20)).toBe(false);
  });
  it("ignores the transparent corners of a rounded tile and a mostly coloured edge", () => {
    const corner = (x, y) => (x < 3 || x >= 17) && (y < 3 || y >= 17);
    expect(ringIsWhite(raster(20, 20, (x, y) => (corner(x, y) ? [0, 0, 0, 0] : edge(x, y, 20, 20, 3) ? [250, 250, 250, 255] : [200, 30, 30, 255])), 20, 20)).toBe(true);
    expect(ringIsWhite(raster(20, 20, (x) => (x < 8 ? [255, 255, 255, 255] : [200, 30, 30, 255])), 20, 20)).toBe(false);
  });
});

describe("detectIconFrame", () => {
  it("answers false for anything but a PNG data icon", async () => {
    expect(await detectIconFrame("data:image/svg+xml;base64,PHN2Zz4=")).toBe(false);
    expect(await detectIconFrame(undefined)).toBe(false);
  });
});

describe("renderDiagramSvg - icon frame", () => {
  const icon = "data:image/png;base64,iVBORw0KGgo=";
  const nodes = (iconFrame) => [{ id: "tile", label: "Tile", icon, iconFrame, position: { x: 0, y: 0 } }];
  it("draws a 1 px grey rounded frame over the tile only when the node asks", () => {
    expect(renderDiagramSvg(nodes(true), [])).toMatch(/<rect [^>]*rx="30\.4" fill="none" stroke="#cfd4da" stroke-width="1"\/>/);
    expect(renderDiagramSvg(nodes(false), [])).not.toContain("#cfd4da");
  });
});
