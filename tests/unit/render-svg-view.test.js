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

  it("paints an edge into a sunset card as a red tag struck through in red, on a red dash", () => {
    const nodes = [NODES[0], { ...NODES[1], sunset: true }, NODES[2]];
    const svg = renderDiagramSvg(nodes, EDGES);
    expect(badge(svg, "calls")).toContain('fill="#fef2f2"');
    expect(svg).toContain('stroke="#dc2626" stroke-width="2.5"');
    expect(badge(svg, "calls")).not.toContain('fill="#1c1e21"');
    expect(svg).toMatch(/stroke="#dc2626" stroke-width="1.5" stroke-dasharray="7.5 4.5"/);
  });

  it("draws solid lines with an arrowhead at the target, off with arrows-off or head none", () => {
    const svg = renderDiagramSvg(NODES, EDGES);
    expect(svg).not.toContain("stroke-dasharray");
    expect(svg.match(/marker-end="url\(#ah-e-\d+\)"/g)).toHaveLength(2);
    expect(renderDiagramSvg(NODES, EDGES, { view: { panels: ["arrows-off"] } })).not.toContain("marker-end");
    const both = renderDiagramSvg(NODES, [{ ...EDGES[0], style: { head: "both", bs: "dashed" } }, { ...EDGES[1], style: { head: "none" } }]);
    expect(both.match(/marker-end=/g)).toHaveLength(1);
    expect(both).toContain('marker-start="url(#ah-s-0)"');
    expect(both).toContain("stroke-dasharray");
  });

  it("marks a new card with the green NEW pill and draws the legend only when it explains something", () => {
    expect(renderDiagramSvg(NODES, EDGES)).not.toContain("sd-legend");
    const nodes = [NODES[0], { ...NODES[1], new: true }, { ...NODES[2], sunset: true }];
    const svg = renderDiagramSvg(nodes, EDGES);
    expect(svg).toContain(">NEW</text>");
    expect(svg).toContain("sd-legend");
    for (const t of ["Path", "Today, being removed", "Decommissioned", "New component"]) expect(svg).toContain(`>${t}</text>`);
    expect(renderDiagramSvg(nodes, EDGES, { view: { panels: ["legend-off"] } })).not.toContain("sd-legend");
  });

  it("cracks a sunset card by default and keeps it whole with cracked: false, still red", () => {
    const cracked = renderDiagramSvg([NODES[0], { ...NODES[1], sunset: true }, NODES[2]], EDGES);
    expect(cracked).toContain('aria-label="Gets decommissioned"');
    const whole = renderDiagramSvg([NODES[0], { ...NODES[1], sunset: true, cracked: false }, NODES[2]], EDGES);
    expect(whole).not.toContain('aria-label="Gets decommissioned"');
    expect(whole).toContain("#fef2f2");
  });

  it("uses the app's own font stack and dot grid", () => {
    const svg = renderDiagramSvg(NODES, EDGES);
    expect(svg).toMatch(/<svg [^>]*font-family="Inter,/);
    expect(svg).toContain('<pattern id="dots"');
  });
});
