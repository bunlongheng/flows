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
  // 1 source above 3 targets in a row: 1 point out, a square brace, a badge per branch.
  const fnodes = { v: node("v", 400, -600), a: node("a", 0, 0), b: node("b", 400, 0), c: node("c", 800, 0) };
  const fedges = [
    { id: "o-a", source: "v", target: "a", label: "opens" },
    { id: "o-b", source: "v", target: "b", label: "opens" },
    { id: "o-c", source: "v", target: "c", label: "opens" },
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
    expect(a.labelX).toBeLessThan(a.sx); // each badge on its own branch
    expect(c.labelX).toBeGreaterThan(c.sx);
  });
  it("draws every branch as its own smooth curve from the shared point, arrowhead kept", () => {
    const c = out("o-c");
    expect(c.drawPath).toBe(c.path);
    expect(c.path.startsWith(`M${c.sx},${c.sy} C`)).toBe(true);
    expect(c.path.endsWith(`${c.tx},${c.ty}`)).toBe(true);
    expect(c.hideArrow).toBe(false);
  });
  it("falls back to a curly square brace when a curve would cut a card", () => {
    // A card right under the source blocks the curve's first stretch toward c, not the square stem.
    const c = out("o-c", { obstacles: [{ x: 560, y: -380, w: 140, h: 120 }] });
    expect(c.path).not.toMatch(/ C/);
  });

});

describe("routeEdge - mixed-label pair", () => {
  // 2 lines with different labels brace only when 1 target sits each side of the card.
  const pn = { v: node("v", 400, -600), a: node("a", 0, 0), c: node("c", 800, 0), b: node("b", 400, 0) };
  const go = (pe, id) => {
    const e = pe.find((x) => x.id === id);
    return routeEdge({
      id, source: "v", target: e.target, sourceNode: pn.v, targetNode: pn[e.target],
      nodeOf: (k) => pn[k], edges: pe, obstacles: [], nodeRects: [], label: e.label,
    });
  };
  it("braces a straddling pair, each with its own badge", () => {
    const pe = [{ id: "p1", source: "v", target: "a", label: "plan" }, { id: "p2", source: "v", target: "c", label: "bill" }];
    const a = go(pe, "p1"), c = go(pe, "p2");
    expect(c.sx).toBe(a.sx);
    expect([a.hideLabel, c.hideLabel]).toEqual([false, false]);
    expect(c.path).toMatch(/ C/);
  });
  it("leaves a pair alone when 1 target sits level with the card", () => {
    const pe = [{ id: "p1", source: "v", target: "b", label: "plan" }, { id: "p2", source: "v", target: "c", label: "bill" }];
    expect(go(pe, "p1").sx).not.toBe(go(pe, "p2").sx);
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
    expect(a.drawPath).toBe(a.path);
    expect(a.path).toMatch(/ C/);
  });
});

describe("routeEdge - a card wholly to 1 side joins that brace", () => {
  // Like Integry: 2 cards to the right, a 3rd below-right, and 1 more straight below.
  const n = { s: node("s", 0, 0), a: node("a", 325, -111), b: node("b", 325, 111), c: node("c", 325, 390), d: node("d", -350, 650) };
  const ed = [
    { id: "a1", source: "s", target: "a", label: "sync" },
    { id: "a2", source: "s", target: "b", label: "sync" },
    { id: "a3", source: "s", target: "c", label: "sync, duplicates" },
    { id: "a4", source: "s", target: "d", label: "record" },
  ];
  const go = (id) => {
    const e = ed.find((x) => x.id === id);
    return routeEdge({ id, source: "s", target: e.target, sourceNode: n.s, targetNode: n[e.target], nodeOf: (k) => n[k], edges: ed, obstacles: [], nodeRects: [], label: e.label });
  };
  it("takes c into the right-side brace, entering its left face, sharp corners", () => {
    const a = go("a1"), c = go("a3");
    expect(c.sx).toBe(a.sx); // the shared point on the right face
    expect(c.sy).toBe(a.sy);
    expect(c.tx).toBe(325); // c's left face
    expect(c.hideLabel).toBe(false);
    expect(c.path).toMatch(/ C/);
  });
});

describe("routeEdge - brace arrival", () => {
  const n = { s: node("s", 0, 0), a: node("a", 325, -111), b: node("b", 325, 111), c: node("c", 325, 390), w: node("w", 700, 390) };
  const base = [
    { id: "a1", source: "s", target: "a", label: "sync" },
    { id: "a2", source: "s", target: "b", label: "sync" },
    { id: "a3", source: "s", target: "c", label: "sync" },
  ];
  const go = (ed, id) => {
    const e = ed.find((x) => x.id === id);
    return routeEdge({ id, source: e.source, target: e.target, sourceNode: n[e.source], targetNode: n[e.target], nodeOf: (k) => n[k], edges: ed, obstacles: [], nodeRects: [], label: e.label });
  };
  it("ends every curve on a short level run, so the arrowhead lines up with it", () => {
    const a = go(base, "a1");
    expect(a.path).toMatch(new RegExp(`${a.tx - 18},${a.ty} L${a.tx},${a.ty}$`));
  });
  it("keeps a joined line off another line already on the target's face", () => {
    const ed = [...base.slice(0, 2), { id: "a3", source: "s", target: "c", label: "sync, dup" }, { id: "z", source: "c", target: "w", label: "out" }];
    const plain = go([...base.slice(0, 2), { id: "a3", source: "s", target: "c", label: "sync, dup" }], "a3");
    const busy = go(ed, "a3");
    expect(busy.tx).toBe(plain.tx);
    expect(busy.ty).toBeLessThan(plain.ty); // stepped toward the source
  });
});
