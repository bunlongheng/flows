import { describe, it, expect } from "vitest";
import { cleanLanes, laneSpan, laneNodes, laneRects, packLanes, LANE_PAD, LANE_MIN, LANE_GAP } from "../../src/lanes.js";

describe("cleanLanes", () => {
  it("keeps typed, bounded lanes and drops the rest", () => {
    const out = cleanLanes([
      { id: "visitor", title: " Visitor ", y: 10.4, h: 200.6, color: "#ff8800" },
      { id: "apps", title: "x".repeat(60), y: 300, h: 20, color: "red" },
      { id: "apps", title: "dupe", y: 1, h: 1 },
      { id: "bad id!", title: "t", y: 0, h: 100 },
      { id: "nan", title: "t", y: NaN, h: 100 },
      null, "lane",
    ]);
    expect(out).toEqual([
      { id: "visitor", title: "Visitor", y: 10, h: 201, color: "#ff8800" },
      { id: "apps", title: "x".repeat(40), y: 10 + 201 + LANE_GAP, h: LANE_MIN },
    ]);
    expect(cleanLanes(undefined)).toEqual([]);
    expect(cleanLanes({ id: "a" })).toEqual([]);
  });
  it("keeps columns too, 1 axis per diagram: the first lane's kind wins", () => {
    expect(cleanLanes([{ id: "v", title: "Visitor", x: -960, w: 1040 }, { id: "r", title: "row", y: 0, h: 100 }, { id: "a", title: "Apps", x: 0, w: 50 }]))
      .toEqual([{ id: "v", title: "Visitor", x: -960, w: 1040 }, { id: "a", title: "Apps", x: -960 + 1040 + LANE_GAP, w: LANE_MIN }]);
  });
});

describe("laneRects", () => {
  it("stands a column the full height of the cards plus padding, rows the full width", () => {
    const rects = [{ x: 100, y: 0, w: 120, h: 120 }, { x: 700, y: 400, w: 120, h: 120 }];
    expect(laneRects([{ id: "v", title: "Visitor", x: 50, w: 300 }], rects)).toEqual([{ id: "v", title: "Visitor", color: undefined, x: 50, w: 300, y: -LANE_PAD, h: 520 + 2 * LANE_PAD }]);
    expect(laneRects([{ id: "v", title: "Visitor", y: 50, h: 300 }], rects)).toEqual([{ id: "v", title: "Visitor", color: undefined, y: 50, h: 300, x: 100 - LANE_PAD, w: 720 + 2 * LANE_PAD }]);
  });
});

describe("laneSpan", () => {
  it("reaches LANE_PAD past the outermost cards", () => {
    expect(laneSpan([{ x: 100, y: 0, w: 180, h: 180 }, { x: 700, y: 400, w: 240, h: 225 }])).toEqual({ x: 100 - LANE_PAD, w: 840 + 2 * LANE_PAD });
  });
});

describe("laneNodes", () => {
  const rects = [{ x: 100, y: 0, w: 120, h: 120 }, { x: 700, y: 0, w: 120, h: 120 }];
  const lanes = [{ id: "a", title: "Apps", y: 40, h: 300, color: "#B464DC" }];
  it("draws 1 static node per lane under the cards: never selectable or draggable, title and colour passed through", () => {
    const [n] = laneNodes(lanes, rects);
    expect(n).toMatchObject({ id: "__lane_a", type: "lane", zIndex: -1, selectable: false, draggable: false, position: { x: 100 - LANE_PAD, y: 40 }, height: 300, data: { title: "Apps", color: "#B464DC" } });
    expect(n.width).toBe(820 + 2 * LANE_PAD - 100);
  });
});

describe("packLanes", () => {
  it("stacks lanes top to bottom with 1 gap, the first where it is, a dragged lane taking its new place", () => {
    const packed = packLanes([{ id: "b", y: 500, h: 100 }, { id: "a", y: 0, h: 200 }, { id: "c", y: 330, h: 50 }]);
    expect(packed.map(l => [l.id, l.y])).toEqual([["a", 0], ["c", 200 + LANE_GAP], ["b", 200 + LANE_GAP + 50 + LANE_GAP]]);
    expect(packLanes([])).toEqual([]);
  });
});
