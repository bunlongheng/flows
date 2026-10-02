import { describe, it, expect } from "vitest";
import { renderDiagramSvg } from "../../lib/render-svg.js";

const NODES = [
  { id: "client", position: { x: 0, y: 0 } },
  { id: "ses", position: { x: 300, y: 0 } },
];
const EDGES = [{ source: "client", target: "ses", label: "webhook" }];

// The pill is a translated group: the first translate before "Start here".
function pillAt(svg) {
  const m = /<g transform="translate\(([-\d.]+),([-\d.]+)\)"><g transform="translate\([^)]*\)"><line/.exec(svg);
  return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
}

describe("renderDiagramSvg - placed start", () => {
  it("draws the Start pill at the owner's spot instead of the automatic one", () => {
    const auto = renderDiagramSvg(NODES, EDGES);
    const placed = renderDiagramSvg(NODES, EDGES, { start: { x: 640, y: 420 } });
    expect(auto).toContain("Start here");
    expect(placed).toContain("Start here");
    expect(pillAt(placed)).toEqual({ x: 640, y: 420 });
    expect(pillAt(auto)).not.toEqual(pillAt(placed));
  });

  it("puts the automatic pill on the first free face in buildMarkers order", () => {
    const auto = renderDiagramSvg(NODES, EDGES);
    // The edge leaves the right face, so the top face is free: x + 6, y - 96.
    expect(pillAt(auto)).toEqual({ x: 6, y: -96 });
  });

  it("ignores an invalid start and falls back to automatic placement", () => {
    const auto = renderDiagramSvg(NODES, EDGES);
    const bad = renderDiagramSvg(NODES, EDGES, { start: { x: NaN, y: 0 } });
    expect(bad).toEqual(auto);
  });
});
