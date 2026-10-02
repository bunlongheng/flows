import { describe, it, expect } from "vitest";
import { cleanLanes, laneSpan, laneNodes, LANE_PAD, LANE_MIN_H } from "../../src/lanes.js";

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
      { id: "apps", title: "x".repeat(40), y: 300, h: LANE_MIN_H },
    ]);
    expect(cleanLanes(undefined)).toEqual([]);
    expect(cleanLanes({ id: "a" })).toEqual([]);
  });
});

describe("laneSpan", () => {
  it("reaches LANE_PAD past the outermost cards", () => {
    expect(laneSpan([{ x: 100, y: 0, w: 180, h: 180 }, { x: 700, y: 400, w: 240, h: 225 }])).toEqual({ x: 100 - LANE_PAD, w: 840 + 2 * LANE_PAD });
  });
});

describe("laneNodes", () => {
  const rects = [{ x: 100, y: 0, w: 180, h: 180 }];
  const lanes = [{ id: "a", title: "Apps", y: 50, h: 300 }];
  it("draws a lane under the cards across the span, a live drag winning over the saved spot", () => {
    const [n] = laneNodes(lanes, rects, { a: { y: 90 } }, null);
    expect(n).toMatchObject({ id: "__lane_a", type: "lane", position: { x: 100 - LANE_PAD, y: 90 }, width: 180 + 2 * LANE_PAD, height: 300, measured: { width: 180 + 2 * LANE_PAD, height: 300 }, zIndex: -1, selectable: false, draggable: false });
    expect(n.data.onLive).toBeUndefined();
  });
  it("is draggable by its title and reports live and committed changes when the owner can edit", () => {
    const calls = [];
    const [n] = laneNodes(lanes, rects, {}, { live: (id, p) => calls.push(["live", id, p]), commit: (id, p) => calls.push(["commit", id, p]) });
    expect(n.draggable).toBe(true);
    expect(n.dragHandle).toBe(".sd-lane-title");
    n.data.onLive({ h: 320 }); n.data.onCommit({ h: 320 });
    expect(calls).toEqual([["live", "a", { h: 320 }], ["commit", "a", { h: 320 }]]);
  });
});
