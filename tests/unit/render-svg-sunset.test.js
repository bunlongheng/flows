import { describe, it, expect } from "vitest";
import { renderDiagramSvg } from "../../lib/render-svg.js";
import { SUNSET } from "../../src/sunset.js";

const NODES = [
  { id: "user", position: { x: 0, y: 0 } },
  { id: "lambda", position: { x: 300, y: 0 }, sunset: true },
];
const EDGES = [{ source: "user", target: "lambda", label: "old path" }];

describe("renderDiagramSvg - sunset node", () => {
  it("greyscales the icon and draws the silver card for a sunset node", () => {
    const svg = renderDiagramSvg(NODES, EDGES);
    expect(svg).toContain("sunset-gray");
    expect(svg).toContain(SUNSET.border);
  });
  it("marks the badge grey and struck through by a red X on an edge leaving a sunset node too", () => {
    const svg = renderDiagramSvg(NODES, [{ source: "lambda", target: "user", label: "old path out" }]);
    expect(svg).toMatch(new RegExp(`<rect [^>]*fill="${SUNSET.tint}" stroke="${SUNSET.border}"[^>]*/><text [^>]*fill="${SUNSET.ink}">old path out</text><path [^>]*stroke="${SUNSET.x}"`));
  });
  it("hides the red X on retiring badges with badge-x-off, keeping the grey tag", () => {
    const svg = renderDiagramSvg(NODES, EDGES, { view: { panels: ["badge-x-off"] } });
    expect(svg).toContain(">old path</text>");
    expect(svg).not.toMatch(new RegExp(`>old path</text><path [^>]*stroke="${SUNSET.x}"`));
  });
  it("keeps the card name black on a retiring card", () => {
    const svg = renderDiagramSvg([{ id: "user", position: { x: 0, y: 0 }, label: "Old thing", sunset: true }], []);
    expect(svg).toMatch(/font-weight="700"[^>]*fill="#111827"[^>]*>[^<]*<\/text>/);
  });
  it("draws a pinned tooltip as a red callout, wrapped, and nothing when not pinned", () => {
    const tip = "Integry termination notice due ~4/1/2027. Contract ends 6/30/2027.";
    const pinned = renderDiagramSvg([{ id: "user", position: { x: 0, y: 0 }, tooltip: tip, pinTooltip: true }], []);
    expect(pinned).toContain('fill="#dc2626"/><text');
    expect(pinned).toContain(">Integry termination notice due</text>");
    expect(pinned).toContain(">~4/1/2027. Contract ends 6/30/2027.</text>");
    const hover = renderDiagramSvg([{ id: "user", position: { x: 0, y: 0 }, tooltip: tip }], []);
    expect(hover).not.toContain("Integry termination");
  });
});
