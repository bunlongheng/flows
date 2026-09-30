import { describe, it, expect } from "vitest";
import { tagText, cleanDesc, TAG_MAX } from "../../src/tag.js";
import { renderDiagramSvg } from "../../lib/render-svg.js";

describe("tagText - what the tag on a line says", () => {
  it("reads the label when there is one, whatever the description", () => {
    expect(tagText("invoke", "Calls the function with the parsed body")).toBe("invoke");
    expect(tagText("  invoke ", "")).toBe("invoke");
  });
  it("reads a short description whole when there is no label", () => {
    expect(tagText("", "Parsed body")).toBe("Parsed body");
    expect(tagText(undefined, "Parsed body")).toBe("Parsed body");
  });
  it("cuts a long description at a word and marks the cut", () => {
    const t = tagText("", "Calls the function with the parsed body and the caller's token");
    expect(t.length).toBeLessThanOrEqual(TAG_MAX + 1);
    expect(t.endsWith("…")).toBe(true);
    expect(t).toBe("Calls the function with the…");
  });
  it("is empty with neither", () => {
    expect(tagText("", "")).toBe("");
    expect(tagText(undefined, undefined)).toBe("");
  });
  it("cleanDesc trims and bounds", () => {
    expect(cleanDesc("  hi ")).toBe("hi");
    expect(cleanDesc("x".repeat(400)).length).toBe(300);
    expect(cleanDesc(42)).toBe("");
  });
});

describe("renderDiagramSvg - the tag on a line", () => {
  const NODES = [{ id: "user", position: { x: 0, y: 0 } }, { id: "lambda", position: { x: 400, y: 0 } }];
  it("draws the description cut short when the edge has no label", () => {
    const svg = renderDiagramSvg(NODES, [{ source: "user", target: "lambda", description: "Calls the function with the parsed body and the caller's token" }]);
    expect(svg).toContain("Calls the function with the…</text>");
  });
  it("draws the label when there is one", () => {
    const svg = renderDiagramSvg(NODES, [{ source: "user", target: "lambda", label: "invoke", description: "Calls the function" }]);
    expect(svg).toContain(">invoke</text>");
    expect(svg).not.toContain("Calls the function");
  });
});
