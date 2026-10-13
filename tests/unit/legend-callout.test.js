import { describe, it, expect } from "vitest";
import { legendRows } from "../../src/legend.js";

describe("legendRows - pinned callout", () => {
  it("adds no legend row for a pinned callout", () => {
    expect(legendRows([{ tooltip: "Notice due", pinTooltip: true }], [])).toEqual([]);
    expect(legendRows([{ tooltip: "Notice due", pinTooltip: true, new: true }], [])).toEqual(["path", "new"]);
  });
});
