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
    const tip = "Integry termination notice due ~4/1/2027";
    const pinned = renderDiagramSvg([{ id: "user", position: { x: 0, y: 0 }, tooltip: tip, pinTooltip: true }], []);
    expect(pinned).toContain('fill="#dc2626"/><text');
    expect(pinned).toContain(">Integry termination</text>");
    expect(pinned).toContain(">notice due ~4/1/2027</text>");
    expect(pinned).toContain(">Important date</text>");
    const hover = renderDiagramSvg([{ id: "user", position: { x: 0, y: 0 }, tooltip: tip }], []);
    expect(hover).not.toContain("Integry termination");
  });
  it("frames a pinned callout above a top-row card inside the viewBox", () => {
    const svg = renderDiagramSvg([{ id: "user", position: { x: 0, y: 0 }, tooltip: "Notice due 4/1/2027", pinTooltip: true }], []);
    const minY = Number(svg.match(/viewBox="[-\d.]+ ([-\d.]+) /)[1]);
    expect(minY).toBeLessThanOrEqual(-24 - 10);
  });
  it("fills the callout with tooltipColor and picks readable text", () => {
    const dark = renderDiagramSvg([{ id: "user", position: { x: 0, y: 0 }, tooltip: "Due soon", pinTooltip: true, tooltipColor: "#1d4ed8" }], []);
    expect(dark).toMatch(/fill="#1d4ed8"\/><text [^>]*fill="#ffffff">Due soon</);
    const light = renderDiagramSvg([{ id: "user", position: { x: 0, y: 0 }, tooltip: "Due soon", pinTooltip: true, tooltipColor: "#fde047" }], []);
    expect(light).toMatch(/fill="#fde047"\/><text [^>]*fill="#1c1e21">Due soon</);
    const junk = renderDiagramSvg([{ id: "user", position: { x: 0, y: 0 }, tooltip: "Due soon", pinTooltip: true, tooltipColor: "red" }], []);
    expect(junk).toMatch(/fill="#dc2626"\/><text [^>]*fill="#ffffff">Due soon</);
  });
  it("draws a red X across a retiring card's icon, and none on a live card", () => {
    const xs = (svg) => (svg.match(new RegExp(`<path d="M[^"]+" stroke="${SUNSET.x}" stroke-width="3"`, "g")) || []).length;
    expect(xs(renderDiagramSvg([{ id: "lambda", position: { x: 0, y: 0 }, sunset: true, cracked: false }], []))).toBe(1);
    expect(xs(renderDiagramSvg([{ id: "lambda", position: { x: 0, y: 0 } }], []))).toBe(0);
  });
  it("points the pinned callout down at its card", () => {
    const svg = renderDiagramSvg([{ id: "user", position: { x: 0, y: 0 }, tooltip: "Due soon", pinTooltip: true }], []);
    expect(svg).toMatch(/<polygon points="[^"]+" fill="#dc2626"\/>/);
  });
});
