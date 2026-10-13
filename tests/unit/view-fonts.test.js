import { describe, it, expect } from "vitest";
import { fontsOf, cleanFonts, cleanView, FONT_DEFAULT } from "../../src/view-state.js";

describe("view_state.fonts", () => {
  it("fills the defaults and clamps each size to its range", () => {
    expect(fontsOf({})).toEqual(FONT_DEFAULT);
    expect(fontsOf({ fonts: { title: 99, sub: 1, tag: "x" } })).toEqual({ title: 22, sub: 8, tag: 8.5 });
  });

  it("stores only the sizes off the default, and nothing for all defaults", () => {
    expect(cleanFonts({ title: 12, sub: 14, tag: 11.3 })).toEqual({ fonts: { sub: 14, tag: 11.5 } });
    expect(cleanFonts({ title: 12 })).toEqual({});
    expect(cleanView({ fonts: { tag: 12 } }).fonts).toEqual({ tag: 12 });
  });
});
