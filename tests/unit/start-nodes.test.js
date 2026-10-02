import { describe, it, expect } from "vitest";
import { startNodeIds } from "../../src/startNodes.js";

const N = ["iphone", "ipad", "macbook", "browser", "registry", "flows"].map(id => ({ id }));

describe("startNodeIds", () => {
  it("marks every source card that feeds the same target under the same label as the first", () => {
    const edges = [
      { source: "iphone", target: "browser", label: "opens shared link" },
      { source: "ipad", target: "browser", label: "opens shared link" },
      { source: "macbook", target: "browser", label: "opens shared link " },
      { source: "browser", target: "flows", label: "opens shared link" },
      { source: "registry", target: "flows", label: "icon, name" },
    ];
    expect(startNodeIds(N, edges)).toEqual(["iphone", "ipad", "macbook"]);
  });
  it("keeps a lone start when the other sources feed something else or carry another label", () => {
    const edges = [
      { source: "iphone", target: "browser", label: "opens shared link" },
      { source: "ipad", target: "browser", label: "opens shared note" },
      { source: "registry", target: "flows", label: "opens shared link" },
    ];
    expect(startNodeIds(N, edges)).toEqual(["iphone"]);
  });
  it("falls back to a card nothing arrives at, then card 0, and never a card that has an incoming edge", () => {
    expect(startNodeIds(N, [])).toEqual(["iphone"]);
    expect(startNodeIds([], [])).toEqual([]);
    expect(startNodeIds(N, [{ source: "ghost", target: "flows" }, { source: "ipad", target: "flows" }])).toEqual(["iphone"]);
  });
});
