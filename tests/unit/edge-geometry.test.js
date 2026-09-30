import { describe, it, expect } from "vitest";
import { routeEdge, pointAlongPath, flattenPath, bendPoint, T_MIN, T_MAX } from "../../src/edgeGeometry.js";

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
