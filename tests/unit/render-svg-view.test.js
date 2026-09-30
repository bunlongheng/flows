import { describe, it, expect } from "vitest";
import { renderDiagramSvg } from "../../lib/render-svg.js";

// The export must read the saved view_state the way the page does: badge
// mode, step numbers and the notes toggle, so a README shows the approved look.

const NODES = [
  { id: "user", position: { x: 0, y: 0 } },
  { id: "apigw", position: { x: 400, y: 0 } },
  { id: "lambda", position: { x: 800, y: 0 } },
];
const EDGES = [
  { id: "e0", source: "user", target: "apigw", label: "calls" },
  { id: "e1", source: "apigw", target: "lambda", label: "invokes" },
];

const badge = (svg, text) => {
  const i = svg.indexOf(`>${text}</text>`);
  const g = svg.lastIndexOf("<g transform", i);
  return svg.slice(g, i);
};

describe("renderDiagramSvg - saved view", () => {
  it("draws dark badges by default", () => {
    const b = badge(renderDiagramSvg(NODES, EDGES), "calls");
    expect(b).toContain('fill="#1c1e21"');
    expect(b).toContain('fill="#fff"');
  });

  it("draws silver, color and plain badge modes", () => {
    const silver = badge(renderDiagramSvg(NODES, EDGES, { view: { badge: "silver" } }), "calls");
    expect(silver).toContain('fill="#e9ebee"');
    expect(silver).toMatch(/stroke="url\(#grad-\d+\)" stroke-width="1.5"/);
    const color = badge(renderDiagramSvg(NODES, EDGES, { view: { badge: "color" } }), "calls");
    expect(color).toMatch(/<rect [^>]*fill="url\(#grad-\d+\)"/);
    const plain = badge(renderDiagramSvg(NODES, EDGES, { view: { badge: "plain" } }), "calls");
    expect(plain).toContain('stroke="#c2c6cc"');
  });

  it("numbers every edge when the steps panel is on", () => {
    const off = renderDiagramSvg(NODES, EDGES);
    const on = renderDiagramSvg(NODES, EDGES, { view: { panels: ["steps"] } });
    expect(badge(off, "invokes")).not.toContain('font-weight="800"');
    expect(badge(on, "calls")).toContain('font-weight="800" fill="#1c1e21">1</text>');
    expect(badge(on, "invokes")).toContain('font-weight="800" fill="#1c1e21">2</text>');
  });

  it("paints an edge into a sunset card as the silver badge with a red X", () => {
    const nodes = [NODES[0], { ...NODES[1], sunset: true }, NODES[2]];
    const svg = renderDiagramSvg(nodes, EDGES);
    expect(badge(svg, "calls")).toContain('stroke-width="1.5"');
    expect(badge(svg, "calls")).not.toContain('fill="#1c1e21"');
    expect(svg.match(/<circle[^>]*fill="#dc2626"|stroke="#dc2626"/g)?.length).toBeGreaterThan(0);
  });

  it("uses the app's own font stack and dot grid", () => {
    const svg = renderDiagramSvg(NODES, EDGES);
    expect(svg).toMatch(/<svg [^>]*font-family="Inter,/);
    expect(svg).toContain('<pattern id="dots"');
  });
});
