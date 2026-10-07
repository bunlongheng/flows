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

// One current walks the diagram, 1 line per slot of the cycle, and the glow
// follows it: the card the live step is crossing into, and nothing else. With
// 2 lines, step 1 (user -> lambda) owns the first half of the cycle.
describe("renderDiagramSvg - arrival glow", () => {
  it("rings the 1 card the current is landing on, in the card's own colour", () => {
    const svg = renderDiagramSvg(NODES, EDGES, { dotPhase: 0.49 });
    const glows = svg.match(/<g class="sd-glow">/g) || [];
    expect(glows).toHaveLength(1); // lambda, where step 1 lands. never user, never sunset s3
    expect(svg).toMatch(/sd-glow"><rect [^>]*stroke="#ed7405"/);
    expect(svg).toContain('id="glow-blur"');
  });
  it("leaves every other card dark, and never shows on a still page", () => {
    // Step 1 has only just set off, so it has not lit lambda yet and the
    // previous loop's last step has finished fading.
    expect(renderDiagramSvg(NODES, EDGES, { dotPhase: 0 })).not.toContain("sd-glow");
    // Step 2 is nearly done, and it runs INTO the sunset card, which never lights.
    expect(renderDiagramSvg(NODES, EDGES, { dotPhase: 0.99 })).not.toContain("sd-glow");
    expect(renderDiagramSvg(NODES, EDGES)).not.toContain("sd-glow");
  });
});
