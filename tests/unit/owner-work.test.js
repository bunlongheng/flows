import { describe, it, expect } from "vitest";
import { keepOwnerWork, okBox, edgeKey, NODE_KEEP, EDGE_KEEP } from "../../lib/owner-work.js";

// An agent calling update_flow sends the whole diagram back. Everything the
// owner did by hand lives in keys an agent never sends, so without this the
// edit is a wipe.
describe("keepOwnerWork", () => {
  const stored = [
    { id: "a", size: { w: 300, h: 240 }, style: { bw: 4 } },
    { id: "b", iconSize: { w: 160, h: 53 } },
  ];

  it("carries the owner's hand work onto a node the agent did not mention it on", () => {
    const out = keepOwnerWork([{ id: "a", label: "New" }, { id: "b" }], stored, NODE_KEEP, (n) => n.id);
    expect(out[0]).toEqual({ id: "a", label: "New", size: { w: 300, h: 240 }, style: { bw: 4 } });
    expect(out[1].iconSize).toEqual({ w: 160, h: 53 });
  });

  it("lets the caller win when it states the field itself", () => {
    const out = keepOwnerWork([{ id: "a", size: { w: 180, h: 180 } }], stored, NODE_KEEP, (n) => n.id);
    expect(out[0].size).toEqual({ w: 180, h: 180 });
  });

  it("adds nothing to a node the diagram has never seen", () => {
    expect(keepOwnerWork([{ id: "new" }], stored, NODE_KEEP, (n) => n.id)[0]).toEqual({ id: "new" });
  });

  it("matches lines by id, so reordering them keeps each line's own look", () => {
    const was = [{ id: "e1", style: { stroke: "#ff0000" } }, { id: "e2", labelT: 0.7 }];
    const out = keepOwnerWork([{ id: "e2" }, { id: "e1" }], was, EDGE_KEEP, edgeKey);
    expect(out[0].labelT).toBe(0.7);
    expect(out[1].style).toEqual({ stroke: "#ff0000" });
  });

  // The cost of an edge with no id: identity falls back to position, so the
  // look follows the SLOT, not the line. This is why every edge should carry one.
  it("falls back to array position when a line has no id", () => {
    const was = [{ style: { bw: 2 } }, {}];
    const out = keepOwnerWork([{}, {}], was, EDGE_KEEP, edgeKey);
    expect(out[0].style).toEqual({ bw: 2 });
  });
});

describe("okBox", () => {
  it("takes a real box in range and refuses anything else", () => {
    expect(okBox({ w: 300, h: 240 }, 130, 600)).toBe(true);
    expect(okBox({ w: 20, h: 240 }, 130, 600)).toBe(false);
    expect(okBox({ w: "300", h: 240 }, 130, 600)).toBe(false);
    expect(okBox(null, 130, 600)).toBe(false);
  });
});
