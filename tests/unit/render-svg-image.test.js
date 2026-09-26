import { describe, it, expect } from "vitest";
import { renderDiagramSvg } from "../../lib/render-svg.js";

const IMG = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

const NODES = [
  { id: "user", position: { x: 0, y: 0 } },
  { id: "shot", position: { x: 400, y: 0 }, image: IMG, label: "Checkout page", sub: "What the user sees", note: "The screen where the card is entered." },
];
const EDGES = [{ source: "user", target: "shot" }];

describe("renderDiagramSvg - picture nodes", () => {
  it("draws a 4:3 photo with a slice crop and a 240-wide card", () => {
    const svg = renderDiagramSvg(NODES, EDGES);
    expect(svg).toContain("<image");
    expect(svg).toContain("xMidYMid slice");
    expect(svg).toContain('width="240"');
    expect(svg).toContain("Checkout page");
    expect(svg).toContain("What the user sees");
  });

  it("starts the note block below y = cy + 112", () => {
    const svg = renderDiagramSvg(NODES, EDGES);
    const shotY = 0 + 225 / 2; // stored position.y (0) + card half-height (IH/2)
    const noteMatch = svg.match(/<g transform="translate\(([\d.]+),([\d.]+)\)">\s*<rect width="240" height="\d+" fill="#ffffff" stroke="#111111"/);
    expect(noteMatch).toBeTruthy();
    const noteY = Number(noteMatch[2]);
    expect(noteY).toBeGreaterThan(shotY + 112);
  });
});
