import { describe, it, expect } from "vitest";
import { renderDiagramSvg } from "../../lib/render-svg.js";
import { layoutOf, cleanLayout } from "../../src/view-state.js";

const NODES = [{ id: "user", position: { x: 0, y: 0 } }, { id: "lambda", position: { x: 400, y: 200 } }];
const cardAt = (svg, n) => [...svg.matchAll(/<g transform="translate\(([-\d.]+),([-\d.]+)\)"><rect width="([\d.]+)"/g)].map(m => m.slice(1).map(Number))[n];

describe("layout: box, gap, vgap", () => {
  it("spreads cards by gap and vgap and scales them by box, in the export", () => {
    const plain = cardAt(renderDiagramSvg(NODES, []), 1);
    const laid = cardAt(renderDiagramSvg(NODES, [], { view: { layout: { gap: 2, vgap: 1.5, box: 1.5 } } }), 1);
    expect(laid[0]).toBeCloseTo(plain[0] * 2, 0);
    expect(laid[1]).toBeCloseTo(plain[1] * 1.5, 0);
    expect(laid[2]).toBe(270);
  });
  it("clamps and keeps only what differs from the default", () => {
    expect(layoutOf({ layout: { gap: 9, box: 0.1 } })).toEqual({ box: 0.6, gap: 3, vgap: 1 });
    expect(cleanLayout({ box: 1, gap: 1.5, vgap: 1 })).toEqual({ layout: { gap: 1.5 } });
    expect(cleanLayout({ box: 1, gap: 1, vgap: 1 })).toEqual({});
  });
});
