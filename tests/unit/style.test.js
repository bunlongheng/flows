import { describe, it, expect } from "vitest";
import { cleanStyle, STROKE_PICKS, BG_PICKS, dashArray } from "../../src/style.js";

// cleanStyle is the only gate between a browser payload and a jsonb column that
// is read straight into a border, a font and an opacity. Everything it lets
// through gets rendered, so the tests are about what it REFUSES.
describe("cleanStyle", () => {
  it("keeps only the keys that were set, so an untouched node stores nothing", () => {
    expect(cleanStyle({})).toBe(null);
    expect(cleanStyle(null)).toBe(null);
    expect(cleanStyle("#e03131")).toBe(null);
    expect(cleanStyle([{ stroke: "#e03131" }])).toBe(null);
    expect(cleanStyle({ stroke: "#E03131" })).toEqual({ stroke: "#e03131" });
  });

  it("refuses a colour that is not a 6-digit hex", () => {
    // These land in a CSS border. "red; background: url(x)" must never survive.
    for (const bad of ["red", "#fff", "rgb(1,2,3)", "#12345g", "#e03131; x", 0x1e1e1e]) {
      expect(cleanStyle({ stroke: bad })).toBe(null);
    }
    expect(cleanStyle({ bg: "transparent" })).toEqual({ bg: "transparent" });
  });

  it("refuses a width, style, radius, font, size or align it cannot draw", () => {
    expect(cleanStyle({ bw: 3, bs: "groove", radius: 7, font: "comic", fs: 99, align: "justify" })).toBe(null);
    expect(cleanStyle({ bw: 4, bs: "dotted", font: "mono", fs: 18, align: "right" }))
      .toEqual({ bw: 4, bs: "dotted", font: "mono", fs: 18, align: "right" });
  });

  it("keeps radius 0, which truthiness would have dropped", () => {
    expect(cleanStyle({ radius: 0 })).toEqual({ radius: 0 });
    expect(cleanStyle({ radius: 12 })).toEqual({ radius: 12 });
  });

  it("clamps opacity to 0-100 and keeps a deliberate 0", () => {
    expect(cleanStyle({ opacity: 0 })).toEqual({ opacity: 0 });
    expect(cleanStyle({ opacity: 140 })).toEqual({ opacity: 100 });
    expect(cleanStyle({ opacity: -20 })).toEqual({ opacity: 0 });
    expect(cleanStyle({ opacity: 55.6 })).toEqual({ opacity: 56 });
    expect(cleanStyle({ opacity: "80" })).toBe(null);
    expect(cleanStyle({ opacity: NaN })).toBe(null);
  });

  it("offers Excalidraw's own picks, so a diagram keeps its palette across the two", () => {
    expect(STROKE_PICKS).toEqual(["#1e1e1e", "#e03131", "#2f9e44", "#1971c2", "#f08c00"]);
    expect(BG_PICKS[0]).toBe("transparent");
    // Every pick has to survive its own validator or the panel writes nothing.
    for (const c of STROKE_PICKS) expect(cleanStyle({ stroke: c })).toEqual({ stroke: c });
    for (const c of BG_PICKS) expect(cleanStyle({ bg: c })).toEqual({ bg: c });
  });

  it("scales the dash with the border, so a 4px dashed line is not solid", () => {
    expect(dashArray("solid", 4)).toBe(null);
    expect(dashArray("dashed", 1)).toBe("5 3");
    expect(dashArray("dashed", 4)).toBe("20 12");
    expect(dashArray("dotted", 2)).toBe("2 5");
  });
});
