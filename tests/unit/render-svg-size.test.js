import { describe, it, expect } from "vitest";
import { renderDiagramSvg } from "../../lib/render-svg.js";

const EDGES = [{ source: "a", target: "b" }];

describe("renderDiagramSvg - resized nodes", () => {
  it("draws a wider card rect for a node with a saved size", () => {
    const defaultNodes = [
      { id: "a", position: { x: 0, y: 0 } },
      { id: "b", position: { x: 400, y: 0 } },
    ];
    const sizedNodes = [
      { id: "a", position: { x: 0, y: 0 }, size: { w: 360, h: 180 } },
      { id: "b", position: { x: 400, y: 0 } },
    ];
    const defaultSvg = renderDiagramSvg(defaultNodes, EDGES);
    const sizedSvg = renderDiagramSvg(sizedNodes, EDGES);
    expect(defaultSvg).toContain('width="158"'); // default icon card (CW)
    expect(sizedSvg).toContain('width="316"');    // 360 real px scaled to the drawn card
  });
});
