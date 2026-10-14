import { describe, it, expect } from "vitest";
import { cleanLevel, levelsOf, levelOf, atLevel, levelScale } from "../../src/view-state.js";

const nodes = [{ id: "a", level: 1 }, { id: "b", level: 2 }, { id: "c", level: 3 }, { id: "free" }];

describe("C4 levels", () => {
  it("cleanLevel keeps an integer 1-4 only", () => {
    expect(cleanLevel(3)).toEqual({ level: 3 });
    for (const bad of ["2", 0, 5, null, undefined, 2.5]) expect(cleanLevel(bad)).toEqual({});
  });

  it("levelsOf lists the sorted unique levels present", () => {
    expect(levelsOf([...nodes, { id: "d", level: 1 }])).toEqual([1, 2, 3]);
    expect(levelsOf([{ id: "x" }])).toEqual([]);
    expect(levelsOf(undefined)).toEqual([]);
  });

  it("levelOf defaults to the lowest, honours a valid pick, ignores an invalid one", () => {
    expect(levelOf({}, nodes)).toBe(1);
    expect(levelOf({ level: 3 }, nodes)).toBe(3);
    expect(levelOf({ level: 4 }, nodes)).toBe(1);
  });

  it("levelOf is null below 2 levels", () => {
    expect(levelOf({ level: 1 }, [{ id: "a", level: 1 }, { id: "b" }])).toBeNull();
    expect(levelOf({}, [{ id: "a" }])).toBeNull();
  });

  it("atLevel keeps unlevelled nodes, drops a deeper card and the lines into it", () => {
    const edges = [
      { id: "e0", source: "a", target: "b" },
      { id: "e1", source: "b", target: "c" },
      { id: "e2", source: "lane:l1", target: "b" },
      { id: "e3", source: "lane:l1", target: "c" },
      { id: "e4", source: "free", target: "a" },
    ];
    const out = atLevel(nodes, edges, 2);
    expect(out.nodes.map((n) => n.id)).toEqual(["a", "b", "free"]);
    expect(out.edges.map((e) => e.id)).toEqual(["e0", "e2", "e4"]);
    expect(atLevel(nodes, edges, null)).toEqual({ nodes, edges });
  });

  it("levelScale grows 1.3x per step below the top and is 1 without levels", () => {
    expect(levelScale([1, 2, 3], 3)).toBe(1);
    expect(levelScale([1, 2, 3], 2)).toBe(1.3);
    expect(levelScale([1, 2, 3], 1)).toBe(1.6);
    expect(levelScale([1, 4], 1)).toBe(1.3);
    expect(levelScale([1, 2, 3], null)).toBe(1);
    expect(levelScale([2], 2)).toBe(1);
  });
});

describe("layoutFit", () => {
  const card = (id) => ({ id, type: "awsNode", position: { x: 0, y: 0 }, data: { id } });
  const edge = (source, target) => ({ id: `${source}-${target}`, source, target });
  const fit = (laid, cv) => {
    const xs = laid.map((n) => n.position.x), ys = laid.map((n) => n.position.y);
    return Math.min(cv.width / (Math.max(...xs) - Math.min(...xs) + 190), cv.height / (Math.max(...ys) - Math.min(...ys) + 180));
  };
  it("keeps whichever of dagre and the fan fits the canvas bigger", async () => {
    const { layoutFit, layoutElements } = await import("../../src/layout.js");
    const { layoutFanOut } = await import("../../src/layoutFan.js");
    const cv = { width: 1400, height: 860 };
    // 1 source fanning out to 3, plus a chain the fan cannot reach from the start.
    const nodes = ["a", "b", "c", "d", "e", "f", "g"].map(card);
    const edges = [edge("a", "b"), edge("a", "c"), edge("a", "d"), edge("e", "f"), edge("f", "g")];
    const pick = layoutFit(nodes, edges, cv);
    const best = Math.max(fit(layoutElements(nodes, edges, { canvas: cv }), cv), fit(layoutFanOut(nodes, edges), cv));
    expect(pick).toHaveLength(7);
    expect(fit(pick, cv)).toBeGreaterThanOrEqual(best - 1e-9);
  });
});
