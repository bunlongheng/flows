import { describe, it, expect } from "vitest";
import { renderDiagramSvg } from "../../lib/render-svg.js";
import { SUNSET } from "../../src/sunset.js";

const NODES = [
  { id: "user", position: { x: 0, y: 0 } },
  { id: "lambda", position: { x: 300, y: 0 }, sunset: true },
];
const EDGES = [{ source: "user", target: "lambda", label: "old path" }];

describe("renderDiagramSvg - sunset node", () => {
  it("greyscales the icon and draws the silver card for a sunset node", () => {
    const svg = renderDiagramSvg(NODES, EDGES);
    expect(svg).toContain("sunset-gray");
    expect(svg).toContain(SUNSET.border);
  });
  it("marks the badge silver with the red X on an edge leaving a sunset node too", () => {
    const svg = renderDiagramSvg(NODES, [{ source: "lambda", target: "user", label: "old path out" }]);
    expect(svg).toContain(`fill="${SUNSET.tint}"`);
    expect(svg).toContain(`fill="${SUNSET.x}"`);
  });
});
