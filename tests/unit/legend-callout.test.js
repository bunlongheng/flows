import { describe, it, expect } from "vitest";
import { legendRows } from "../../src/legend.js";

describe("legendRows - pinned callout", () => {
  it("adds Important date only when a card pins a tooltip", () => {
    expect(legendRows([{ tooltip: "Notice due", pinTooltip: true }], [])).toEqual(["path", "callout"]);
    expect(legendRows([{ tooltip: "Notice due" }], [])).toEqual([]);
    expect(legendRows([{ pinTooltip: true }], [])).toEqual([]);
  });
});
