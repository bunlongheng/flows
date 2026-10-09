import { describe, it, expect } from "vitest";
import { renderDiagramSvg } from "../../lib/render-svg.js";

// A request and its reply between the same 2 cards run as 2 lanes 36 px apart,
// too close for a badge to sit on either without touching the other. The
// export hangs each badge off its lane on a short leader, on the pair's
// outside, exactly as the canvas does.

const NODES = [
  { id: "user", position: { x: 0, y: 0 } },
  { id: "apigw", position: { x: 400, y: 0 } },
];
const PAIR = [
  { id: "e0", source: "user", target: "apigw", label: "request" },
  { id: "e1", source: "apigw", target: "user", label: "reply" },
];

const lead = (svg, i) => {
  const m = [...svg.matchAll(/<line class="sd-edge-lead" x1="([\d.-]+)" y1="([\d.-]+)" x2="([\d.-]+)" y2="([\d.-]+)"/g)][i];
  return m && { x1: +m[1], y1: +m[2], x2: +m[3], y2: +m[4] };
};

describe("renderDiagramSvg - paired lines", () => {
  it("hangs the 2 badges off their lines on leaders, to opposite sides", () => {
    const svg = renderDiagramSvg(NODES, PAIR);
    const a = lead(svg, 0), b = lead(svg, 1);
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(lead(svg, 2)).toBeUndefined();
    // Level lanes: each leader is vertical and at least the lead long.
    expect(Math.abs(a.x2 - a.x1)).toBeLessThan(0.5);
    expect(Math.abs(a.y2 - a.y1)).toBeGreaterThan(14);
    expect(Math.sign(a.y2 - a.y1)).toBe(-Math.sign(b.y2 - b.y1));
  });

  it("draws no leader for a line on its own", () => {
    expect(renderDiagramSvg(NODES, PAIR.slice(0, 1))).not.toContain("sd-edge-lead");
  });
});
