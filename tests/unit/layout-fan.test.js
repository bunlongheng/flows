import { describe, it, expect } from "vitest";
import { layoutFanOut } from "../../src/layoutFan.js";

// Copied from tests/unit/layout.test.js on purpose - layoutFan.js is a
// separate module from layout.js and does not share test helpers with it.
const NODE_W = 190;
const NODE_H = 120;

const overlaps = nodes => {
  const hits = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i].position;
      const b = nodes[j].position;
      if (Math.abs(a.x - b.x) < NODE_W && Math.abs(a.y - b.y) < NODE_H) hits.push(`${nodes[i].id} / ${nodes[j].id}`);
    }
  }
  return hits;
};

const mk = (ids, pairs) => [
  ids.map(id => ({ id, type: "awsNode", data: { id } })),
  pairs.map(([source, target], i) => ({ id: `e${i}`, source, target })),
];

// root r fans into a, b, c, d, and b itself fans into b1, b2.
const [FAN_NODES, FAN_EDGES] = mk(
  ["r", "a", "b", "c", "d", "b1", "b2"],
  [["r", "a"], ["r", "b"], ["r", "c"], ["r", "d"], ["b", "b1"], ["b", "b2"]],
);

// The same tree plus a node the start cannot reach.
const [LOOSE_NODES, LOOSE_EDGES] = mk(
  ["r", "a", "b", "c", "d", "b1", "b2", "z"],
  [["r", "a"], ["r", "b"], ["r", "c"], ["r", "d"], ["b", "b1"], ["b", "b2"]],
);

const centerOf = out => {
  const byId = Object.fromEntries(out.map(n => [n.id, n]));
  return id => ({
    x: byId[id].position.x + (byId[id].measured?.width ?? 190) / 2,
    y: byId[id].position.y + (byId[id].measured?.height ?? 180) / 2,
  });
};

describe("layoutFanOut", () => {
  it("siblings stack top to bottom in edge order and share a column", () => {
    const out = layoutFanOut(FAN_NODES, FAN_EDGES);
    const c = centerOf(out);
    expect(c("a").x).toBeCloseTo(c("c").x, 5);
    expect(c("a").x).toBeCloseTo(c("d").x, 5);
    expect(c("a").y).toBeLessThan(c("b").y);
    expect(c("b").y).toBeLessThan(c("c").y);
    expect(c("c").y).toBeLessThan(c("d").y);
  });

  it("a parent sits centred on its children", () => {
    const out = layoutFanOut(FAN_NODES, FAN_EDGES);
    const c = centerOf(out);
    expect(c("r").y).toBeCloseTo((c("a").y + c("d").y) / 2, 5);
    expect(c("b").y).toBeCloseTo((c("b1").y + c("b2").y) / 2, 5);
  });

  it("has no overlapping nodes", () => {
    expect(overlaps(layoutFanOut(FAN_NODES, FAN_EDGES))).toEqual([]);
    expect(overlaps(layoutFanOut(LOOSE_NODES, LOOSE_EDGES))).toEqual([]);
  });

  it("a node the start cannot reach still gets placed below the tree", () => {
    const out = layoutFanOut(LOOSE_NODES, LOOSE_EDGES);
    const c = centerOf(out);
    const others = LOOSE_NODES.map(n => n.id).filter(id => id !== "z");
    others.forEach(id => expect(c("z").y).toBeGreaterThan(c(id).y));
  });

  it("is stable", () => {
    const once = layoutFanOut(FAN_NODES, FAN_EDGES);
    const twice = layoutFanOut(once, FAN_EDGES);
    const at = ns => Object.fromEntries(ns.map(n => [n.id, `${Math.round(n.position.x)},${Math.round(n.position.y)}`]));
    expect(at(twice)).toEqual(at(once));
  });
});
