import { describe, it, expect } from "vitest";
import { renderDiagramSvg } from "../../lib/render-svg.js";

const NODES = [
  { id: "client", position: { x: 0, y: 0 } },
  { id: "ses", position: { x: 300, y: 0 } },
];
const EDGES = [{ source: "client", target: "ses", label: "webhook" }];

describe("renderDiagramSvg - placed start", () => {
  it("draws the Start pill at the owner's spot instead of the automatic one", () => {
    const auto = renderDiagramSvg(NODES, EDGES);
    const placed = renderDiagramSvg(NODES, EDGES, { start: { x: 0, y: 0 } });
    expect(auto).toContain("Start here");
    expect(placed).toContain("Start here");
    // The connector line coordinates differ between the automatic pill (well
    // off to the left of the card) and one pinned to the diagram's origin.
    const line = /<line x1="[^"]+" y1="[^"]+" x2="[^"]+" y2="[^"]+" stroke="#16a34a"/;
    expect(auto.match(line)?.[0]).not.toEqual(placed.match(line)?.[0]);
  });

  it("ignores an invalid start and falls back to automatic placement", () => {
    const auto = renderDiagramSvg(NODES, EDGES);
    const bad = renderDiagramSvg(NODES, EDGES, { start: { x: NaN, y: 0 } });
    expect(bad).toEqual(auto);
  });
});
