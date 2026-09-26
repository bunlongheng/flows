import { describe, it, expect } from "vitest";
import { layoutFanOut } from "../../src/layoutFan.js";

// Copied from tests/unit/layout.test.js on purpose - layoutFan.js is a
// separate module from layout.js and does not share test helpers with it.
const NODE_W = 190;
const NODE_H = 180;

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

// 12 leaves straight off the hub.
const WIDE_IDS = Array.from({ length: 12 }, (_, i) => `n${i}`);
const [WIDE_NODES, WIDE_EDGES] = mk(["r", ...WIDE_IDS], WIDE_IDS.map(id => ["r", id]));

// A deep, lopsided tree: the first child carries a long tail, the others are
// leaves, so the tail must not push its siblings apart.
const [DEEP_NODES, DEEP_EDGES] = mk(
  ["r", "a", "b", "c", "a1", "a2", "a11", "a12", "a13"],
  [["r", "a"], ["r", "b"], ["r", "c"], ["a", "a1"], ["a", "a2"], ["a1", "a11"], ["a1", "a12"], ["a1", "a13"]],
);

const centerOf = out => {
  const byId = Object.fromEntries(out.map(n => [n.id, n]));
  return id => ({
    x: byId[id].position.x + (byId[id].measured?.width ?? NODE_W) / 2,
    y: byId[id].position.y + (byId[id].measured?.height ?? NODE_H) / 2,
  });
};

const box = out => {
  const xs = out.map(n => n.position.x), ys = out.map(n => n.position.y);
  return { w: Math.max(...xs) - Math.min(...xs) + NODE_W, h: Math.max(...ys) - Math.min(...ys) + NODE_H };
};

describe("layoutFanOut", () => {
  it("children sit to the right of their parent, top to bottom in edge order", () => {
    const c = centerOf(layoutFanOut(FAN_NODES, FAN_EDGES));
    ["a", "b", "c", "d"].forEach(id => expect(c(id).x).toBeGreaterThan(c("r").x + NODE_W));
    ["b1", "b2"].forEach(id => expect(c(id).x).toBeGreaterThan(c("b").x + NODE_W));
    expect(c("a").y).toBeLessThan(c("b").y);
    expect(c("b").y).toBeLessThan(c("c").y);
    expect(c("c").y).toBeLessThan(c("d").y);
  });

  it("bows like a fan: the middle children reach further right than the outer ones", () => {
    const c = centerOf(layoutFanOut(FAN_NODES, FAN_EDGES));
    expect(c("a").x).toBeCloseTo(c("d").x, 5);
    expect(c("b").x).toBeGreaterThan(c("a").x);
    expect(c("c").x).toBeGreaterThan(c("d").x);
  });

  it("a parent sits level with the middle of its children", () => {
    const c = centerOf(layoutFanOut(FAN_NODES, FAN_EDGES));
    expect(c("r").y).toBeCloseTo((c("a").y + c("d").y) / 2, 5);
    expect(c("b").y).toBeCloseTo((c("b1").y + c("b2").y) / 2, 5);
  });

  it("packs tight: siblings are only a small gap apart and a tail never spreads its aunts", () => {
    const fan = layoutFanOut(FAN_NODES, FAN_EDGES);
    const c = centerOf(fan);
    expect(c("d").y - c("c").y).toBeLessThan(NODE_H + 60);
    expect(box(fan).h).toBeLessThan(5 * NODE_H + 4 * 60);
    const deep = centerOf(layoutFanOut(DEEP_NODES, DEEP_EDGES));
    expect(deep("c").y - deep("b").y).toBeLessThan(NODE_H + 60);
  });

  it("runs left to right: every step deeper is a step further right", () => {
    const c = centerOf(layoutFanOut(DEEP_NODES, DEEP_EDGES));
    expect(c("a").x).toBeGreaterThan(c("r").x + NODE_W);
    expect(c("a1").x).toBeGreaterThan(c("a").x + NODE_W);
    expect(c("a11").x).toBeGreaterThan(c("a1").x + NODE_W);
  });

  it("has no overlapping nodes", () => {
    expect(overlaps(layoutFanOut(FAN_NODES, FAN_EDGES))).toEqual([]);
    expect(overlaps(layoutFanOut(LOOSE_NODES, LOOSE_EDGES))).toEqual([]);
    expect(overlaps(layoutFanOut(WIDE_NODES, WIDE_EDGES))).toEqual([]);
    expect(overlaps(layoutFanOut(DEEP_NODES, DEEP_EDGES))).toEqual([]);
  });

  it("leaves room for a note under a card so the next card never covers it", () => {
    const note = "x".repeat(150);
    const nodes = FAN_NODES.map(n => (n.id === "a" ? { ...n, data: { ...n.data, note } } : n));
    const plain = centerOf(layoutFanOut(FAN_NODES, FAN_EDGES));
    const noted = centerOf(layoutFanOut(nodes, FAN_EDGES));
    // 150 chars wrap to 6 lines of 14px under a 190px card: about 106px extra.
    expect(noted("b").y - noted("a").y).toBeGreaterThan(plain("b").y - plain("a").y + 90);
    expect(overlaps(layoutFanOut(nodes, FAN_EDGES))).toEqual([]);
  });

  it("widens the run to a child for a wide edge label, and only there", () => {
    const edges = FAN_EDGES.map(e => (e.source === "b" && e.target === "b1" ? { ...e, label: "no force, ask Jev (TypeSafe key)" } : e));
    const plain = centerOf(layoutFanOut(FAN_NODES, FAN_EDGES));
    const wide = centerOf(layoutFanOut(FAN_NODES, edges));
    expect(wide("b1").x - wide("b").x).toBeGreaterThan(plain("b1").x - plain("b").x + 100);
    expect(wide("a").x - wide("r").x).toBeCloseTo(plain("a").x - plain("r").x, 5);
  });

  it("a lone child or a pair sit flush with no arc bulge", () => {
    const c = centerOf(layoutFanOut(FAN_NODES, FAN_EDGES));
    // b has 2 children: both at the plain gap, the same distance as an outer child of r.
    expect(c("b1").x - c("b").x).toBeCloseTo(c("a").x - c("r").x, 5);
    const [N, E] = mk(["r", "a"], [["r", "a"]]);
    const one = centerOf(layoutFanOut(N, E));
    expect(one("a").x - one("r").x).toBeCloseTo(c("a").x - c("r").x, 5);
  });

  it("a node the start cannot reach still gets placed below the fan", () => {
    const c = centerOf(layoutFanOut(LOOSE_NODES, LOOSE_EDGES));
    LOOSE_NODES.map(n => n.id).filter(id => id !== "z").forEach(id => expect(c("z").y).toBeGreaterThan(c(id).y));
  });

  it("is stable", () => {
    const once = layoutFanOut(FAN_NODES, FAN_EDGES);
    const twice = layoutFanOut(once, FAN_EDGES);
    const at = ns => Object.fromEntries(ns.map(n => [n.id, `${Math.round(n.position.x)},${Math.round(n.position.y)}`]));
    expect(at(twice)).toEqual(at(once));
  });
});
