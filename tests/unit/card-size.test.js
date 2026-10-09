import { describe, it, expect } from "vitest";
import { sizingOf, cleanSizing, lineCounts, cardSize } from "../../src/card-size.js";
import { cleanView } from "../../src/view-state.js";
import { renderDiagramSvg } from "../../lib/render-svg.js";

const hand = { id: "a", size: { w: 300, h: 300 } };

describe("card sizing", () => {
  it("defaults to custom when a card has a hand size, else match", () => {
    expect(sizingOf({}, [hand])).toBe("custom");
    expect(sizingOf(null, [{ id: "b" }])).toBe("match");
    expect(sizingOf({ sizing: "auto" }, [hand])).toBe("auto");
  });
  it("match ignores hand sizes, custom keeps them", () => {
    expect(cardSize(hand, "match", 5)).toBeNull();
    expect(cardSize(hand, "custom", 5)).toEqual({ w: 300, h: 300 });
  });
  it("auto grows 10% per line past the first, capped at 1.5x", () => {
    expect(cardSize({}, "auto", 1)).toBeNull();
    expect(cardSize({}, "auto", 3)).toEqual({ w: 216, h: 216 });
    expect(cardSize({}, "auto", 40)).toEqual({ w: 270, h: 270 });
  });
  it("counts lines in and out", () => {
    expect(lineCounts([{ source: "a", target: "b" }, { source: "b", target: "c" }]).get("b")).toBe(2);
  });
  it("is kept by cleanView and drawn by the renderer", () => {
    expect(cleanView({ sizing: "auto" }).sizing).toBe("auto");
    expect(cleanSizing("huge")).toEqual({});
    const nodes = [{ id: "a", position: { x: 0, y: 0 }, size: { w: 300, h: 300 } }, { id: "b", position: { x: 600, y: 0 } }];
    const edges = [{ id: "e1", source: "a", target: "b" }];
    expect(renderDiagramSvg(nodes, edges, { view: { sizing: "custom" } })).toContain('<rect width="300" height="300"');
    expect(renderDiagramSvg(nodes, edges, { view: { sizing: "match" } })).not.toContain('<rect width="300" height="300"');
  });
});
