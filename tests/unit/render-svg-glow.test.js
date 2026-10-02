import { describe, it, expect } from "vitest";
import { renderDiagramSvg } from "../../lib/render-svg.js";

const NODES = [
  { id: "user", position: { x: 0, y: 0 } },
  { id: "lambda", position: { x: 300, y: 0 } },
  { id: "s3", position: { x: 600, y: 0 }, sunset: true },
];
const EDGES = [
  { source: "user", target: "lambda", label: "invoke" },
  { source: "lambda", target: "s3", label: "put" },
];

describe("renderDiagramSvg - arrival glow", () => {
  it("rings the card the dots run into as the beat lands, in the card's own colour", () => {
    const svg = renderDiagramSvg(NODES, EDGES, { dotPhase: 0 });
    const glows = svg.match(/<g class="sd-glow">/g) || [];
    expect(glows).toHaveLength(1); // lambda: a target. user: never a target. s3: sunset, so no glow
    expect(svg).toContain('id="glow-blur"');
  });
  it("has faded out by the middle of the trip, and never shows on a still page", () => {
    expect(renderDiagramSvg(NODES, EDGES, { dotPhase: 0.6 })).not.toContain("sd-glow");
    expect(renderDiagramSvg(NODES, EDGES)).not.toContain("sd-glow");
  });
});
