import { describe, it, expect } from "vitest";
import { cleanLanes, laneSpan, laneNodes, laneRects, laneGaps, packLanes, fitLanes, sectionRects, laneRef, laneNodeId, cardsColor, SECTION_PAD, LANE_PAD, LANE_MIN, LANE_GAP, LANE_FIT } from "../../src/lanes.js";

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
  it("keeps a title size inside 10 to 40 px and drops a size that is not a number", () => {
    const out = cleanLanes([
      { id: "a", title: "t", y: 0, h: 100, size: 18.4 },
      { id: "b", title: "t", y: 200, h: 100, size: 99 },
      { id: "c", title: "t", y: 400, h: 100, size: "big" },
    ]);
    expect(out.map((l) => l.size)).toEqual([18, 40, undefined]);
  });
  it("keeps columns too, 1 axis per diagram: the first lane's kind wins", () => {
    expect(cleanLanes([{ id: "v", title: "Visitor", x: -960, w: 1040 }, { id: "r", title: "row", y: 0, h: 100 }, { id: "a", title: "Apps", x: 0, w: 50 }]))
      .toEqual([{ id: "v", title: "Visitor", x: -960, w: 1040 }, { id: "a", title: "Apps", x: -960 + 1040 + LANE_GAP, w: LANE_MIN }]);
  });
});

describe("laneRects", () => {
  it("stands a column the full height of the cards plus padding, rows the full width", () => {
    const rects = [{ x: 100, y: 0, w: 120, h: 120 }, { x: 700, y: 400, w: 120, h: 120 }];
    expect(laneRects([{ id: "v", title: "Visitor", x: 50, w: 300 }], rects)).toEqual([{ id: "v", title: "Visitor", color: undefined, size: undefined, x: 50, w: 220 - 50 + LANE_FIT, y: -LANE_PAD, h: 520 + 2 * LANE_PAD }]); // the card at x 100 is inside, so the band ends LANE_FIT past it
    expect(laneRects([{ id: "v", title: "Visitor", y: 50, h: 300 }], rects)).toEqual([{ id: "v", title: "Visitor", color: undefined, size: undefined, y: 50, h: 300, x: 100 - LANE_PAD, w: 720 + 2 * LANE_PAD }]);
  });
});

describe("fitLanes", () => {
  const lanes = [{ id: "a", y: 0, h: 360 }, { id: "b", y: 400, h: 360 }, { id: "c", y: 800, h: 360 }];
  it("ends a band LANE_FIT past its last card, note included, and leaves an empty lane alone", () => {
    const fit = fitLanes(lanes, [{ x: 0, y: 40, w: 180, h: 180 }, { x: 300, y: 40, w: 180, h: 250 }, { x: 0, y: 440, w: 180, h: 180 }]);
    expect(fit.map(l => [l.id, l.y, l.h])).toEqual([["a", 0, 290 + LANE_FIT], ["b", 400, 220 + LANE_FIT], ["c", 800, 360]]);
  });
  it("never grows across the next band and never thins past LANE_MIN", () => {
    expect(fitLanes(lanes, [{ x: 0, y: 40, w: 180, h: 600 }])[0].h).toBe(400 - LANE_GAP);
    expect(fitLanes([{ id: "a", y: 0, h: 360 }], [{ x: 0, y: 0, w: 180, h: 10 }])[0].h).toBe(LANE_MIN);
    expect(fitLanes([{ id: "a", x: 0, w: 500 }], [{ x: 20, y: 0, w: 180, h: 180 }])[0].w).toBe(200 + LANE_FIT);
  });
});

describe("laneSpan", () => {
  it("reaches LANE_PAD past the outermost cards", () => {
    expect(laneSpan([{ x: 100, y: 0, w: 180, h: 180 }, { x: 700, y: 400, w: 240, h: 225 }])).toEqual({ x: 100 - LANE_PAD, w: 840 + 2 * LANE_PAD });
  });
});

describe("laneNodes", () => {
  const rects = [{ x: 100, y: 0, w: 120, h: 120 }, { x: 700, y: 0, w: 120, h: 120 }];
  const lanes = [{ id: "a", title: "Apps", y: 40, h: 300, color: "#B464DC", size: 18 }];
  it("draws 1 static node per lane under the cards: never selectable or draggable, title and colour passed through", () => {
    const [n] = laneNodes(lanes, rects);
    expect(n).toMatchObject({ id: "__lane_a", type: "lane", zIndex: -1, selectable: false, draggable: false, position: { x: 100 - LANE_PAD, y: 40 }, height: 300, data: { title: "Apps", color: "#B464DC", size: 18 } });
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

describe("laneGaps", () => {
  it("finds the strips between column lanes on the x axis", () => {
    const rects = [{ x: 0, y: 0, w: 500, h: 900 }, { x: 540, y: 0, w: 300, h: 900 }, { x: 880, y: 0, w: 200, h: 900 }];
    expect(laneGaps(rects)).toEqual({ axis: "x", mids: [520, 860] });
  });
  it("finds row gaps on the y axis and nothing for 1 lane", () => {
    expect(laneGaps([{ x: 0, y: 0, w: 900, h: 200 }, { x: 0, y: 240, w: 900, h: 200 }])).toEqual({ axis: "y", mids: [220] });
    expect(laneGaps([{ x: 0, y: 0, w: 900, h: 200 }])).toBeNull();
  });
});

describe("laneRef", () => {
  it("reads the lane id out of a lane edge end and maps it to the canvas node id", () => {
    expect(laneRef("lane:apps")).toBe("apps");
    expect(laneRef("apps")).toBeNull();
    expect(laneRef(undefined)).toBeNull();
    expect(laneNodeId("apps")).toBe("__lane_apps");
  });
});

// A lane can be split into 2 or 3 titled slices across its own band, so 2
// groups share 1 row instead of stacking 2 lanes.
describe("sections", () => {
  const split = [{ id: "team", title: "", y: 0, h: 300, color: "#0F766E", sections: [
    { id: "jobs", title: "Jobs", at: -100 },
    { id: "work", title: "Work", at: 1300, color: "#E650BA" },
  ] }];

  it("keeps 2 or 3 typed sections, sorted, and drops a lone or malformed one", () => {
    expect(cleanLanes(split)[0].sections).toEqual([
      { id: "jobs", title: "Jobs", at: -100 },
      { id: "work", title: "Work", at: 1300, color: "#E650BA" },
    ]);
    // Out of order comes back in order, and a 4th is cut.
    const many = [{ id: "a", y: 0, h: 300, sections: [{ id: "c", at: 900 }, { id: "b", at: 100 }, { id: "a", at: 0 }, { id: "d", at: 1200 }] }];
    expect(cleanLanes(many)[0].sections.map(s => s.id)).toEqual(["a", "b", "c"]);
    // 1 section is not a split; neither is one with no `at` or a repeated id.
    for (const bad of [[{ id: "only", at: 0 }], [{ id: "a", at: 0 }, { id: "a", at: 9 }], [{ id: "a" }, { id: "b" }], "no"]) {
      expect(cleanLanes([{ id: "x", y: 0, h: 300, sections: bad }])[0].sections).toBeUndefined();
    }
  });

  it("leaves a LANE_GAP between sections, the first from the band's own edge and the last to its far one", () => {
    const [r] = laneRects(cleanLanes(split), [{ x: 0, y: 40, w: 190, h: 180 }, { x: 2000, y: 40, w: 190, h: 180 }]);
    const secs = sectionRects(r, "row");
    expect(secs.map(s => [s.x, s.w])).toEqual([[r.x, 1300 - LANE_GAP - r.x], [1300, r.x + r.w - 1300]]);
    // The space between 2 sections is the space between 2 lanes.
    expect(secs[1].x - (secs[0].x + secs[0].w)).toBe(LANE_GAP);
    // Same y and h as the band, and a section with no colour takes the lane's.
    expect(secs.every(s => s.y === r.y && s.h === r.h)).toBe(true);
    expect(secs.map(s => s.color)).toEqual(["#0F766E", "#E650BA"]);
  });

  it("pulls a section start outside the band back inside it, so sections never overlap or escape", () => {
    const far = [{ id: "a", y: 0, h: 300, sections: [{ id: "l", at: 0 }, { id: "r", at: 99999 }] }];
    const [r] = laneRects(cleanLanes(far), [{ x: 0, y: 40, w: 190, h: 180 }]);
    const secs = sectionRects(r, "row");
    expect(secs[1].x).toBe(r.x + r.w);
    expect(secs[1].w).toBe(0);
    expect(secs[0].x + secs[0].w).toBe(secs[1].x - LANE_GAP);
    // A start so close to the one before it that the gap would eat the section
    // costs it its width, and never paints backwards.
    const tight = [{ id: "a", y: 0, h: 300, sections: [{ id: "l", at: -200 }, { id: "r", at: -70 }] }];
    const [t] = laneRects(cleanLanes(tight), [{ x: 0, y: 40, w: 190, h: 180 }]);
    expect(sectionRects(t, "row")[0].w).toBe(0);
  });

  it("hands LaneNode its slices in the band's own coordinates, and none when there is no split", () => {
    const [n] = laneNodes(cleanLanes(split), [{ x: 0, y: 40, w: 190, h: 180 }, { x: 2000, y: 40, w: 190, h: 180 }]);
    expect(n.data.axis).toBe("row");
    // Each section hugs its own card, SECTION_PAD each side, wherever its `at` cut.
    expect(n.data.sections.map(s => [s.x, s.w])).toEqual([[-SECTION_PAD - n.position.x, 190 + 2 * SECTION_PAD], [2000 - SECTION_PAD - n.position.x, 190 + 2 * SECTION_PAD]]);
    expect(n.data.sections.every(s => s.y === 0 && s.h === n.height)).toBe(true);
    const [plain] = laneNodes([{ id: "a", title: "Apps", y: 0, h: 300 }], [{ x: 0, y: 40, w: 190, h: 180 }]);
    expect(plain.data.sections).toEqual([]);
  });
});


describe("a band with no colour takes its cards' colour", () => {
  it("mixes the colourful cards and skips black or grey logos", () => {
    expect(cardsColor([{ color: "#6040e0" }, { color: "#2080ff" }, { color: "#111111" }])).toBe("#3046ef");
    expect(cardsColor([{ color: "#111111" }, {}])).toBeNull();
  });
  it("a lane and each section draw in their own cards' mix, a set colour still wins", () => {
    const lanes = cleanLanes([{ id: "a", title: "A", y: 0, h: 250, sections: [{ at: 0, id: "s1", title: "S1" }, { at: 500, id: "s2", title: "S2", color: "#ff0000" }] }]);
    const [r] = laneRects(lanes, [{ x: 0, y: 40, w: 180, h: 180, color: "#6040e0" }, { x: 600, y: 40, w: 180, h: 180, color: "#2080ff" }]);
    expect(r.color).toBe("#3046ef");
    const [s1, s2] = sectionRects(r, "row", [{ x: 0, y: 40, w: 180, h: 180, color: "#6040e0" }, { x: 600, y: 40, w: 180, h: 180, color: "#2080ff" }]);
    expect(s1.color).toBe("#6040e0");
    expect(s2.color).toBe("#ff0000");
  });
});
