import { describe, it, expect } from "vitest";
import { renderDiagramSvg } from "../../lib/render-svg.js";

const NODES = [{ id: "user", position: { x: 0, y: 0 } }, { id: "lambda", position: { x: 500, y: 0 } }];
const EDGES = [{ source: "user", target: "lambda", label: "calls" }];
const tagY = (svg) => Number(svg.match(/<g class="sd-tag" transform="translate\([-\d.]+,([-\d.]+)\)"/)[1]);

describe("tags-above", () => {
  it("lifts a level line's badge clear above the line, with no leader", () => {
    const on = renderDiagramSvg(NODES, EDGES), above = renderDiagramSvg(NODES, EDGES, { view: { panels: ["tags-above"] } });
    expect(tagY(above)).toBeLessThan(tagY(on) - 10);
    expect(above).not.toContain('class="sd-edge-lead"');
  });
  it("keeps a dashed interim line grey even into a retiring card", () => {
    const svg = renderDiagramSvg([NODES[0], { ...NODES[1], sunset: true }], [{ ...EDGES[0], style: { bs: "dashed", stroke: "#9aa0a6" } }]);
    expect(svg).toMatch(/stroke="#9aa0a6"[^>]*stroke-dasharray/);
    expect(svg).toContain(">Interim or optional</text>");
  });
});
