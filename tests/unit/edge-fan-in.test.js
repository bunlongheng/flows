import { describe, it, expect } from "vitest";
import { routeEdge } from "../../src/edgeGeometry.js";

// 3 sources in a row above 1 target, all saying the same thing: 1 trunk, 1 badge.
const node = (id, x, y, w = 180, h = 180) => ({
  id, measured: { width: w, height: h }, internals: { positionAbsolute: { x, y } },
});
const nodes = { a: node("a", 0, 0), b: node("b", 400, 0), c: node("c", 800, 0), d: node("d", 1200, 0), n: node("n", 400, 600) };
const edges = [
  { id: "e-a", source: "a", target: "n", label: "POST" },
  { id: "e-b", source: "b", target: "n", label: "POST" },
  { id: "e-c", source: "c", target: "n", label: "POST" },
  { id: "e-d", source: "d", target: "n", label: "other" },
];
const route = (id, extra = {}) => {
  const e = edges.find((x) => x.id === id);
  return routeEdge({
    id, source: e.source, target: e.target, sourceNode: nodes[e.source], targetNode: nodes.n,
    nodeOf: (k) => nodes[k], edges, obstacles: [], nodeRects: [], label: e.label, ...extra,
  });
};

describe("routeEdge - fan-in trunk", () => {
  it("gives every member the same target point and the leader the badge", () => {
    const a = route("e-a"), b = route("e-b"), c = route("e-c");
    expect([b.tx, c.tx]).toEqual([a.tx, a.tx]);
    expect([a.ty, b.ty, c.ty]).toEqual([600, 600, 600]); // the top face of n
    expect(a.hideLabel).toBe(false);
    expect(b.hideLabel).toBe(true);
    expect(c.hideLabel).toBe(true);
    expect(a.labelX).toBe(a.tx); // the badge sits on the trunk
  });
  it("strokes a follower only as far as the bus, but its dot rides on to the target", () => {
    const b = route("e-b");
    expect(b.path.endsWith(`L${b.tx},${b.ty}`)).toBe(true);
    expect(b.drawPath.endsWith(`L${b.tx},${b.ty}`)).toBe(false);
    expect(b.path.startsWith(b.drawPath)).toBe(true);
    expect(route("e-a").drawPath).toBe(route("e-a").path);
  });
  it("leaves a line with a different tag out of the trunk", () => {
    const d = route("e-d");
    expect(d.hideLabel).toBe(false);
    expect(d.drawPath).toBe(d.path);
    expect(d.tx).not.toBe(route("e-a").tx);
  });
  it("routes a member on its own when a card blocks its way to the bus", () => {
    const a = route("e-a", { obstacles: [{ x: 150, y: 300, w: 180, h: 180 }] });
    expect(a.drawPath).toBe(a.path);
    expect(a.hideLabel).toBe(false);
  });
});

describe("routeEdge - trunk bus between swimlanes", () => {
  // Sources end at y 180, the target starts at 600: the bus would sit at 390,
  // inside a lane. With a lane gap centred at 300 the bus moves into the gap.
  it("runs the bus along the gap between the lanes it crosses", () => {
    const gaps = { axis: "y", mids: [300] };
    const b = route("e-b", { gaps });
    expect(b.drawPath).toMatch(/,300/);
    expect(route("e-b").drawPath).not.toMatch(/,300/);
  });
  it("ignores gaps on the other axis", () => {
    expect(route("e-b", { gaps: { axis: "x", mids: [300] } }).drawPath).not.toMatch(/,300/);
  });
});

describe("routeEdge - fan-out brace", () => {
  // 1 source above 3 targets in a row: 1 point out, a square brace, a badge per branch, labels or not alike.
  const fnodes = { v: node("v", 400, -600), a: node("a", 0, 0), b: node("b", 400, 0), c: node("c", 800, 0) };
  const fedges = [
    { id: "o-a", source: "v", target: "a", label: "opens" },
    { id: "o-b", source: "v", target: "b", label: "opens" },
    { id: "o-c", source: "v", target: "c", label: "bills" },
  ];
  const out = (id, extra = {}) => {
    const e = fedges.find((x) => x.id === id);
    return routeEdge({
      id, source: "v", target: e.target, sourceNode: fnodes.v, targetNode: fnodes[e.target],
      nodeOf: (k) => fnodes[k], edges: fedges, obstacles: [], nodeRects: [], label: e.label, ...extra,
    });
  };
  it("leaves the source at 1 point, every branch carrying its own badge on its own leg", () => {
    const a = out("o-a"), b = out("o-b"), c = out("o-c");
    expect([b.sx, c.sx]).toEqual([a.sx, a.sx]);
    expect([a.sy, b.sy, c.sy]).toEqual([-420, -420, -420]); // the bottom face of v
    expect([a.hideLabel, b.hideLabel, c.hideLabel]).toEqual([false, false, false]);
    expect(a.labelX).toBe(a.tx); // on the leg into a
    expect(c.labelX).toBe(c.tx);
  });
  it("draws square legs, no curve, the bar halfway between source and targets", () => {
    const c = out("o-c");
    expect(c.drawPath).toBe(c.path);
    expect(c.path).not.toMatch(/ C/);
    expect(c.path).toMatch(/,-210/); // halfway from -420 to 0
    expect(c.drawPath.endsWith(`L${c.tx},${c.ty}`)).toBe(true);
    expect(c.hideArrow).toBe(false);
  });
    expect(c.path).toMatch(/ C/);
  });
});

describe("routeEdge - brace line type", () => {
  it("splits brace lines into 1 card as a square brace, each keeping its badge", () => {
    const be = edges.map((e) => (e.label === "POST" ? { ...e, data: { style: { arrow: "brace" } } } : e));
    const r = (id) => {
      const e = be.find((x) => x.id === id);
      return routeEdge({
        id, source: e.source, target: "n", sourceNode: nodes[e.source], targetNode: nodes.n,
        nodeOf: (k) => nodes[k], edges: be, obstacles: [], nodeRects: [], label: e.label, arrow: "brace",
      });
    };
    const a = r("e-a"), b = r("e-b");
    expect(b.tx).toBe(a.tx); // 1 shared point on the target
    expect([a.hideLabel, b.hideLabel]).toEqual([false, false]);
    expect(b.drawPath).toBe(b.path);
    expect(a.path).not.toMatch(/ C/);
  });
});
