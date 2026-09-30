import { describe, it, expect } from "vitest";
import { renderDiagramSvg } from "../../lib/render-svg.js";

const IMG = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

const NODES = [
  { id: "user", position: { x: 0, y: 0 } },
  { id: "shot", position: { x: 400, y: 0 }, image: IMG, label: "Checkout page", sub: "What the user sees", note: "The screen where the card is entered." },
];
const EDGES = [{ source: "user", target: "shot" }];

describe("renderDiagramSvg - picture nodes", () => {
  it("draws a photo with a slice crop on a 240 x 225 card", () => {
    const svg = renderDiagramSvg(NODES, EDGES);
    expect(svg).toContain("<image");
    expect(svg).toContain("xMidYMid slice");
    expect(svg).toContain('<rect width="240" height="225"');
    expect(svg).toContain("Checkout page");
    expect(svg).toContain("What the user sees");
  });

  it("starts the note block 5 px below the card, where the canvas puts it", () => {
    const svg = renderDiagramSvg(NODES, EDGES);
    const i = svg.indexOf("The screen where");
    const before = svg.slice(0, i);
    const m = [...before.matchAll(/<g transform="translate\(([-\d.]+),([-\d.]+)\)"><rect x="-1" y="0"/g)].pop();
    expect(m).toBeTruthy();
    expect(Number(m[2])).toBe(225 + 5);
  });
});
