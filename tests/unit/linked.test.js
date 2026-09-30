import { describe, it, expect } from "vitest";
import { isLinkedTitle, creationTags } from "../../lib/linked.js";

// A repo audit or README pass names its diagram "owner/repo - ...", and that
// diagram belongs under Linked, not My Diagrams.
describe("linked tag", () => {
  it("reads a repo title", () => {
    expect(isLinkedTitle("ThryvLabs/ubs-appmarket-poc - Architecture")).toBe(true);
    expect(isLinkedTitle("bunlongheng/mindmaps: how it works")).toBe(true);
    expect(isLinkedTitle("UBS AppMarket POC - Context")).toBe(false);
    expect(isLinkedTitle("Stock Bots V7 - Lightest: One Box")).toBe(false);
    expect(isLinkedTitle("")).toBe(false);
  });

  it("tags the source, and linked only when asked or titled so", () => {
    expect(creationTags("API", "Flows Architecture")).toEqual(["API"]);
    expect(creationTags("API", "bunlongheng/flows - Architecture")).toEqual(["API", "linked"]);
    expect(creationTags("MCP", "Flows Architecture", true)).toEqual(["MCP", "linked"]);
    expect(creationTags("MCP", "bunlongheng/flows - Architecture", false)).toEqual(["MCP"]);
  });
});
