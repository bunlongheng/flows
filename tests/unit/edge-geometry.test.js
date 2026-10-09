import { describe, it, expect } from "vitest";
import { routeEdge, badgeShift, LEAD, pointAlongPath, flattenPath, bendPoint, T_MIN, T_MAX } from "../../src/edgeGeometry.js";

// The same module routes the canvas (GradientEdge) and the server export, so
// a line the owner sees on the page is the line a README gets.

const node = (id, x, y, w = 180, h = 180) => ({
  id, measured: { width: w, height: h }, internals: { positionAbsolute: { x, y } },
});

function route(extra = {}) {
  const a = node("a", 0, 0), b = node("b", 400, 0);
  const nodes = { a, b };
  return routeEdge({
    id: "e0", source: "a", target: "b", sourceNode: a, targetNode: b,
    nodeOf: (id) => nodes[id], edges: [{ id: "e0", source: "a", target: "b" }],
    obstacles: [], nodeRects: [{ x: 0, y: 0, w: 180, h: 180 }, { x: 400, y: 0, w: 180, h: 180 }],
    ...extra,
  });
}

describe("routeEdge", () => {
  it("leaves the right face of the source and enters the left face of the target", () => {
    const r = route();
    expect(r.path.startsWith("M")).toBe(true);
    expect(r.sx).toBe(180);
    expect(r.tx).toBe(400);
    expect(r.sSide).toBe("right");
    expect(r.tSide).toBe("left");
  });

  it("puts the label between the two ends", () => {
    const r = route();
    expect(r.labelX).toBeGreaterThan(180);
    expect(r.labelX).toBeLessThan(400);
  });

  it("gives a straight arrow a 2-point path and a curved arrow a curve", () => {
    expect(route({ arrow: "straight" }).path).toMatch(/^M[^LQC]*L[^LQC]*$/);
    expect(route({ arrow: "curved" }).path).toMatch(/C/);
  });

  it("falls back to the given ends when a node is not measured yet", () => {
    const r = routeEdge({
      id: "e0", source: "a", target: "b", sourceNode: { id: "a" }, targetNode: { id: "b" },
      nodeOf: () => null, edges: [], obstacles: [], nodeRects: [],
      fallback: { sx: 1, sy: 2, tx: 3, ty: 4 },
    });
    expect(r.path).toContain("M1");
  });
});

describe("pointAlongPath", () => {
  it("walks a polyline by arc length", () => {
    const d = "M0 0 L100 0 L100 100";
    expect(pointAlongPath(d, 0)).toEqual({ x: 0, y: 0 });
    expect(pointAlongPath(d, 0.5)).toEqual({ x: 100, y: 0 });
    expect(pointAlongPath(d, 1)).toEqual({ x: 100, y: 100 });
  });

  it("flattens curves into points that start and end on the anchors", () => {
    const pts = flattenPath("M0 0 Q50 100 100 0");
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[pts.length - 1]).toEqual({ x: 100, y: 0 });
    expect(pts.length).toBeGreaterThan(10);
  });

  it("keeps the badge inside the T window", () => {
    expect(T_MIN).toBeGreaterThan(0);
    expect(T_MAX).toBeLessThan(1);
    const mid = bendPoint(0, 0, 100, 0, { t: 0.5, d: 0 });
    expect(mid).toEqual({ x: 50, y: 0 });
  });
});

describe("routeEdge - a pair of lines between the same 2 cards", () => {
  const a = node("a", 0, 0), b = node("b", 400, 0);
  const nodes = { a, b };
  const edges = [{ id: "e0", source: "a", target: "b" }, { id: "e1", source: "b", target: "a" }];
  const go = (id, s, t) => routeEdge({
    id, source: s, target: t, sourceNode: nodes[s], targetNode: nodes[t],
    nodeOf: (k) => nodes[k], edges, obstacles: [], nodeRects: [],
  });

  it("sends each badge off its line, away from the other line", () => {
    const r0 = go("e0", "a", "b"), r1 = go("e1", "b", "a");
    expect(r0.labelOff).toBeTruthy();
    expect(r1.labelOff).toBeTruthy();
    // A level pair: the offsets are vertical and opposite.
    expect(Math.abs(r0.labelOff.x)).toBeLessThan(0.01);
    expect(Math.abs(r1.labelOff.x)).toBeLessThan(0.01);
    expect(Math.sign(r0.labelOff.y)).toBe(-Math.sign(r1.labelOff.y));
    // Each points to the outside: the upper lane's badge goes up.
    expect(Math.sign(r0.labelOff.y)).toBe(Math.sign(r0.sy - r1.sy));
  });

  it("leaves a lone line's badge on the line", () => {
    expect(route().labelOff).toBeNull();
  });

  it("badgeShift clears the line by the badge's extent across it plus the lead", () => {
    const up = badgeShift({ x: 0, y: -1 }, 80, 20);
    expect(up.dx).toBeCloseTo(0);
    expect(up.dy).toBeCloseTo(-(10 + LEAD));
    const right = badgeShift({ x: 1, y: 0 }, 80, 20);
    expect(right.dx).toBeCloseTo(40 + LEAD);
    expect(badgeShift(null, 80, 20)).toEqual({ dx: 0, dy: 0 });
  });
});
