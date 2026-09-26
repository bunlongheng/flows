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

// 12 leaves straight off the hub: more than fit at the widest slot, so the
// fan has to squeeze its slices and push the ring out.
const WIDE_IDS = Array.from({ length: 12 }, (_, i) => `n${i}`);
const [WIDE_NODES, WIDE_EDGES] = mk(["r", ...WIDE_IDS], WIDE_IDS.map(id => ["r", id]));

const centerOf = out => {
  const byId = Object.fromEntries(out.map(n => [n.id, n]));
  return id => ({
    x: byId[id].position.x + (byId[id].measured?.width ?? 190) / 2,
    y: byId[id].position.y + (byId[id].measured?.height ?? 180) / 2,
  });
};

// Polar view from the hub: distance and angle (radians, 0 = straight right).
const polarFrom = c => (hub, id) => {
  const dx = c(id).x - c(hub).x, dy = c(id).y - c(hub).y;
  return { r: Math.hypot(dx, dy), a: Math.atan2(dy, dx) };
};

describe("layoutFanOut", () => {
  it("siblings share a ring around the hub and spread top to bottom in edge order", () => {
    const c = centerOf(layoutFanOut(FAN_NODES, FAN_EDGES));
    const p = polarFrom(c);
    const ring = p("r", "a").r;
    ["b", "c", "d"].forEach(id => expect(p("r", id).r).toBeCloseTo(ring, 5));
    expect(p("r", "a").a).toBeLessThan(p("r", "b").a);
    expect(p("r", "b").a).toBeLessThan(p("r", "c").a);
    expect(p("r", "c").a).toBeLessThan(p("r", "d").a);
  });

  it("the fan is symmetric about the hub and faces right", () => {
    const c = centerOf(layoutFanOut(FAN_NODES, FAN_EDGES));
    const p = polarFrom(c);
    expect(p("r", "a").a).toBeCloseTo(-p("r", "d").a, 5);
    ["a", "b", "c", "d", "b1", "b2"].forEach(id => expect(c(id).x).toBeGreaterThan(c("r").x));
  });

  it("a parent sits at the middle angle of its children, one ring in", () => {
    const c = centerOf(layoutFanOut(FAN_NODES, FAN_EDGES));
    const p = polarFrom(c);
    expect(p("r", "b").a).toBeCloseTo((p("r", "b1").a + p("r", "b2").a) / 2, 5);
    expect(p("r", "b1").r).toBeGreaterThan(p("r", "b").r + NODE_W);
    expect(p("r", "b2").r).toBeCloseTo(p("r", "b1").r, 5);
  });

  it("has no overlapping nodes, even with more leaves than the widest slot fits", () => {
    expect(overlaps(layoutFanOut(FAN_NODES, FAN_EDGES))).toEqual([]);
    expect(overlaps(layoutFanOut(LOOSE_NODES, LOOSE_EDGES))).toEqual([]);
    expect(overlaps(layoutFanOut(WIDE_NODES, WIDE_EDGES))).toEqual([]);
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
