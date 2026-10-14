import { describe, it, expect } from "vitest";
import { cleanLevel, levelsOf, levelOf, atLevel } from "../../src/view-state.js";

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
});
