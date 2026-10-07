import { describe, it, expect } from "vitest";
import { snapAlign, houseGap, snapSuggest } from "../../src/snapAlign.js";

const node = (id, x, y) => ({ id, position: { x, y }, measured: { width: 150, height: 100 } });

describe("snapAlign", () => {
  it("latches a near-miss onto the neighbour's left edge and reports a guide", () => {
    const dragged = node("a", 306, 500); // 6px off b's x
    const { position, guides } = snapAlign(dragged, [node("b", 300, 200)]);
    expect(position.x).toBe(300);
    expect(guides).toContainEqual({ axis: "x", at: 300, from: 200, to: 600 });
  });

  it("aligns both axes at once when both are within range", () => {
    const { position, guides } = snapAlign(node("a", 604, 297), [node("b", 600, 300)]);
    expect(position).toEqual({ x: 600, y: 300 });
    expect(guides).toHaveLength(2);
  });

  it("leaves the position alone when nothing is close enough", () => {
    const { position, guides } = snapAlign(node("a", 500, 500), [node("b", 900, 900)]);
    expect(position).toEqual({ x: 500, y: 500 });
    expect(guides).toEqual([]);
  });

  it("snaps to the closest line, not the first one found", () => {
    // b's right edge (450) is 4px away, c's left edge (460) is 6px away.
    const { position } = snapAlign(node("a", 454, 0), [node("b", 300, 0), node("c", 460, 0)]);
    expect(position.x).toBe(450);
  });

  it("aligns centers, so two different-width nodes stack on one axis", () => {
    const wide = { id: "b", position: { x: 280, y: 0 }, measured: { width: 190, height: 100 } };
    // wide center = 375; dragged (w 150) center at 372 -> x should become 300.
    const { position } = snapAlign(node("a", 297, 400), [wide]);
    expect(position.x).toBe(300);
  });

  it("ignores itself and nodes with no position", () => {
    const dragged = node("a", 306, 500);
    const { position } = snapAlign(dragged, [dragged, { id: "ghost" }]);
    expect(position).toEqual({ x: 306, y: 500 });
  });
});

describe("houseGap", () => {
  const rect = (x, y) => ({ x, y, w: 150, h: 100 });

  it("reports the most common gap between row neighbours", () => {
    // 3 cards in a row at a 40px gap, plus 1 pair at 90 - 40 wins on count.
    const rects = [rect(0, 0), rect(190, 0), rect(380, 0), rect(620, 0)];
    expect(houseGap(rects, "x")).toBe(40);
  });

  it("measures columns on the y axis", () => {
    const rects = [rect(0, 0), rect(0, 160), rect(0, 320)];
    expect(houseGap(rects, "y")).toBe(60);
  });

  it("stays silent when a single pair is all there is", () => {
    expect(houseGap([rect(0, 0), rect(190, 0)], "x")).toBe(null);
  });

  it("ignores cards that share no row", () => {
    expect(houseGap([rect(0, 0), rect(190, 500)], "x")).toBe(null);
  });
});

describe("snapSuggest", () => {
  const node = (id, x, y) => ({ id, position: { x, y }, measured: { width: 150, height: 100 } });
  // A row of 3 at a 40px gap: 0, 190, 380. The house gap is 40.
  const row = [node("b", 0, 0), node("c", 190, 0), node("d", 380, 0)];

  it("latches onto the house gap when alignment has nothing to say", () => {
    // y=0 aligns with the row; x=562 is 8px short of the 570 that a 40px gap wants.
    const { position, guides } = snapSuggest(node("a", 562, 0), row);
    expect(position.x).toBe(570);
    expect(guides.find(g => g.kind === "gap")).toMatchObject({ axis: "x", gap: 40 });
  });

  it("measures the ribbon across the gap it closed", () => {
    const g = snapSuggest(node("a", 562, 0), row).guides.find(x => x.kind === "gap");
    expect(g.from).toBe(530); // d's right edge
    expect(g.to).toBe(570);   // where the dragged card now starts
  });

  it("draws the rule and the measure together when the two agree", () => {
    // Nudged onto b exactly: aligned on both axes AND a house gap from c.
    // The rule says it lines up, the ribbon says the space is the usual 40.
    const { guides } = snapSuggest(node("a", 4, 3), row);
    expect(guides.some(g => g.kind !== "gap")).toBe(true);
    expect(guides.find(g => g.kind === "gap")).toMatchObject({ gap: 40 });
  });

  it("gives the axis to padding when the house gap is the closer of the two", () => {
    // A column line sits at x=760 (9px away) and the 40px house gap wants 570.
    // Dropped at 573 the gap is 3px off and the column 187 - padding must win.
    const rows = [...row, node("e", 760, 400)];
    const { position, guides } = snapSuggest(node("a", 573, 0), rows);
    expect(position.x).toBe(570);
    expect(guides.find(g => g.axis === "x").kind).toBe("gap");
  });

  it("does not move a card that is nowhere near a house gap", () => {
    expect(snapSuggest(node("a", 900, 0), row).position.x).toBe(900);
  });
});
