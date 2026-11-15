import { describe, it, expect } from "vitest";
import { cleanLegend, legendList, legendRows } from "../../src/legend.js";
import { storeView, viewPatch } from "../../lib/view-state.js";
import { renderDiagramSvg } from "../../lib/render-svg.js";

describe("custom legend rows", () => {
  it("cleans labels, colours and kinds, caps at 12", () => {
    expect(cleanLegend([{ label: "  Payments  team " , color: "#2563EB", kind: "line" }, { label: "" }, { label: "x", color: "red", kind: "zig" }]))
      .toEqual([{ label: "Payments team", color: "#2563EB", kind: "line" }, { label: "x" }]);
    expect(cleanLegend(Array.from({ length: 20 }, (_, i) => ({ label: `r${i}` })))).toHaveLength(12);
    expect(cleanLegend("nope")).toEqual([]);
  });
  it("lists auto rows first, then custom ones", () => {
    const list = legendList(legendRows([{ new: true }], []), [{ label: "Owned by us", color: "#2563EB" }]);
    expect(list.map((r) => r.label)).toEqual(["Path", "New component", "Owned by us"]);
    expect(list[2]).toEqual({ label: "Owned by us", kind: "custom-box", color: "#2563EB" });
  });
  it("stores on create and merges on update", () => {
    expect(storeView({ legend: [{ label: "A" }] }).legend).toEqual([{ label: "A" }]);
    expect(storeView({}).legend).toBeUndefined();
    expect(viewPatch({ legend: [{ label: "B", kind: "dash" }] })).toEqual({ patch: { legend: [{ label: "B", kind: "dash" }] }, keys: ["legend"] });
    expect(viewPatch({ legend: [] })).toEqual({ patch: {}, keys: ["legend"] });
  });
  it("draws custom rows in the SVG, and legend-off hides them", () => {
    const nodes = [{ id: "a", label: "A", position: { x: 0, y: 0 } }];
    const svg = renderDiagramSvg(nodes, [], { view: { legend: [{ label: "Owned by us", color: "#2563EB" }] } });
    expect(svg).toContain("sd-legend");
    expect(svg).toContain("Owned by us");
    const off = renderDiagramSvg(nodes, [], { view: { panels: ["legend-off"], legend: [{ label: "Owned by us" }] } });
    expect(off).not.toContain("Owned by us");
  });
});
