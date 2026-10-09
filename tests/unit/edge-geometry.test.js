import { describe, it, expect } from "vitest";
import { routeEdge, badgeShift, LEAD, pointAlongPath, flattenPath, bendPoint, badgeBox, clearBadge, T_MIN, T_MAX } from "../../src/edgeGeometry.js";

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

  // Owner 2026-10-09: "if 1 line going in pls going in center not off center".
  // The hub's face carries 3 lines so its slots are spread; the card at the
  // other end carries 1, and that one enters dead centre however far the hub's
  // slot sits from it. Straightening used to drag the lone end instead,
  // because an empty face has nothing to collide with.
  it("takes a lone line into the middle of the face, whatever the other end does", () => {
    const hub = node("hub", 0, 0);
    // near sits 30 px off the hub's top slot: close enough that the router
    // wants 1 straight line, too far for the hub's own slot to give way.
    const near = node("near", 400, -14), mid = node("mid", 400, 150), far = node("far", 400, 330);
    const nodes = { hub, near, mid, far };
    const edges = [
      { id: "e0", source: "hub", target: "near" },
      { id: "e1", source: "hub", target: "mid" },
      { id: "e2", source: "hub", target: "far" },
    ];
    const one = (id, target) => routeEdge({
      id, source: "hub", target, sourceNode: hub, targetNode: nodes[target],
      nodeOf: (k) => nodes[k], edges, obstacles: [], nodeRects: [],
    });
    for (const [id, target] of [["e0", "near"], ["e1", "mid"], ["e2", "far"]]) {
      const r = one(id, target);
      expect(r.ty, `${id} enters ${target}`).toBe(nodes[target].internals.positionAbsolute.y + 90);
    }
    // The hub's own 3 slots stay spread, so the lines do not pile onto 1 pixel.
    expect(new Set([one("e0", "near").sy, one("e1", "mid").sy, one("e2", "far").sy]).size).toBe(3);
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

describe("no 2 lines on 1 track", () => {
  // 2 lines crossing round 1 card: unreserved, both pick the same vertical lane
  // and draw on top of each other for its whole length.
  const all = { a1: node("a1", 0, 0), a2: node("a2", 0, 600), b1: node("b1", 800, 600), b2: node("b2", 800, 0), w: node("w", 400, 300) };
  const box = (n) => ({ x: n.internals.positionAbsolute.x, y: n.internals.positionAbsolute.y, w: 180, h: 180 });
  const pairs = [["a1", "b1"], ["a2", "b2"]];
  const edges = pairs.map(([s, t], i) => ({ id: `e${i}`, source: s, target: t }));
  const go = (i, taken) => {
    const [s, t] = pairs[i];
    return routeEdge({
      id: `e${i}`, source: s, target: t, sourceNode: all[s], targetNode: all[t], nodeOf: (k) => all[k], edges, taken,
      obstacles: Object.values(all).filter((n) => n.id !== s && n.id !== t).map(box), nodeRects: Object.values(all).map(box),
    });
  };
  const gap = (A, B) => Math.min(...B.flatMap((l) => A.filter((t) => t.h === l.h && Math.min(t.hi, l.hi) - Math.max(t.lo, l.lo) > 14)
    .map((t) => Math.abs(t.c - l.c))));
  it("keeps the 2nd line off the legs the 1st reserved", () => {
    const first = go(0, []);
    expect(gap(first.legs, go(1, []).legs)).toBe(0);
    expect(gap(first.legs, go(1, first.legs).legs)).toBeGreaterThanOrEqual(8);
  });
});

describe('no tag on a tag', () => {
  const line = 'M0 0 L400 0'
  it('slides an auto badge along its own line off an earlier badge', () => {
    const box = badgeBox('12 target: sync', true)
    const placed = [{ ...badgeBox('5 today: sync', true), x: 200, y: 0 }]
    const at = clearBadge(line, { x: 200, y: 0 }, box, null, placed)
    expect(at.y).toBe(0)
    expect(Math.abs(at.x - 200) * 2).toBeGreaterThanOrEqual(box.w + placed[0].w)
    expect(clearBadge(line, { x: 200, y: 0 }, box, null, [])).toEqual({ x: 200, y: 0 })
  })
  it('grows the leader of a short paired line with no clear spot', () => {
    const box = badgeBox('alerts', true), off = { x: 0, y: -1 }
    const at = clearBadge('M0 0 L60 0', { x: 30, y: 0 }, box, off, [{ w: 200, h: 18, x: 30, y: -23 }])
    expect(at.lead).toBeGreaterThan(0)
  })
})

describe("tag side", () => {
  it("hangs a tag off its line on the side the owner picked", async () => {
    const { sideOff, badgeShift } = await import("../../src/edgeGeometry.js");
    expect(sideOff("right")).toEqual({ x: 1, y: 0 });
    expect(sideOff("sideways")).toBeNull();
    const { dx, dy } = badgeShift(sideOff("left"), 100, 18);
    expect(dx).toBeLessThan(-50);
    expect(dy).toBe(0);
  });
});
