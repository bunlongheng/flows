import { describe, it, expect } from "vitest";
import { cleanLanes, laneSpan, LANE_PAD, LANE_MIN_H } from "../../src/lanes.js";

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
