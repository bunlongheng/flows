import { describe, it, expect } from "vitest";
import { renderDiagramSvg } from "../../lib/render-svg.js";

const EDGES = [{ source: "a", target: "b" }];

describe("renderDiagramSvg - resized nodes", () => {
  // Cards are drawn at the canvas's own size, 180 px, so an export never
  // shrinks what the owner approved on the page.
  it("draws the default card at 180 and a saved size at its real width", () => {
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
    expect(defaultSvg).toContain('<rect width="180" height="180"');
    expect(defaultSvg).not.toContain('<rect width="360"');
    expect(sizedSvg).toContain('<rect width="360" height="180"');
  });

  it("draws a node's icon at exactly its iconSize when the card has room", () => {
    const nodes = [
      { id: "user", position: { x: 0, y: 0 }, iconSize: { w: 96, h: 96 } },
      { id: "b", position: { x: 400, y: 0 } },
    ];
    const svg = renderDiagramSvg(nodes, EDGES);
    const icon = /<image [^>]*?x="([\d.]+)" y="[\d.]+" width="([\d.]+)" height="([\d.]+)"/.exec(svg);
    expect(icon).toBeTruthy();
    expect(Number(icon[2])).toBe(96);
    expect(Number(icon[3])).toBe(96);
    expect(Number(icon[1])).toBe(42); // centred in the 160 px inner width
  });

  it("lets an unsized icon fill the room above the label, like the canvas", () => {
    const svg = renderDiagramSvg([{ id: "user", position: { x: 0, y: 0 } }, { id: "b", position: { x: 400, y: 0 } }], EDGES);
    const icon = /<image [^>]*?x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/.exec(svg);
    expect(Number(icon[1])).toBe(10);   // card padding
    expect(Number(icon[3])).toBe(160);  // 180 minus 2 x 10 padding
    expect(Number(icon[4])).toBeGreaterThan(100);
    expect(Number(icon[4])).toBeLessThan(160);
  });
});
