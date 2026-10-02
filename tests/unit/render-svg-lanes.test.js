import { describe, it, expect } from "vitest";
import { renderDiagramSvg } from "../../lib/render-svg.js";
import { LANE_PAD } from "../../src/lanes.js";

const NODES = [{ id: "client", position: { x: 0, y: 0 } }, { id: "ses", position: { x: 300, y: 400 } }];
const EDGES = [{ source: "client", target: "ses", label: "webhook" }];
const LANES = [{ id: "a", title: "Visitor", y: -60, h: 300 }, { id: "b", title: "Inbox", y: 340, h: 300, color: "#dc2626" }];

describe("renderDiagramSvg - swimlanes", () => {
  it("draws each lane as a bordered band the width of the cards plus padding, titled in uppercase", () => {
    const svg = renderDiagramSvg(NODES, EDGES, { view: { lanes: LANES } });
    expect(svg.match(/class="sd-lane"/g)).toHaveLength(2);
    expect(svg).toContain(`<rect x="${-LANE_PAD}.0" y="-60.0" width="${480 + 2 * LANE_PAD}.0" height="300.0" rx="10" fill="#64748b" fill-opacity="0.05" stroke="#64748b" stroke-opacity="0.35" stroke-width="1.5"/>`);
    expect(svg).toContain('stroke="#dc2626" stroke-opacity="0.35" stroke-width="1.5"');
    expect(svg).toContain(">VISITOR</text>");
    expect(svg).toContain('fill="#dc2626">INBOX</text>');
  });
  it("draws nothing extra without lanes, and the picture grows to hold a lane", () => {
    expect(renderDiagramSvg(NODES, EDGES)).not.toContain("sd-lane");
    const tall = renderDiagramSvg(NODES, EDGES, { view: { lanes: [{ id: "a", title: "t", y: 0, h: 1200 }] } });
    const h = Number(/viewBox="[-\d.]+ [-\d.]+ [\d.]+ ([\d.]+)"/.exec(tall)[1]);
    expect(h).toBeGreaterThanOrEqual(1200 + 80);
  });
  it("keeps lanes in the under layer only, so a GIF paints them once", () => {
    const opts = { view: { lanes: LANES }, dotPhase: 0 };
    expect(renderDiagramSvg(NODES, EDGES, { ...opts, layer: "under" })).toContain("sd-lane");
    expect(renderDiagramSvg(NODES, EDGES, { ...opts, layer: "motion" })).not.toContain("sd-lane");
    expect(renderDiagramSvg(NODES, EDGES, { ...opts, layer: "over" })).not.toContain("sd-lane");
  });
  it("draws no Start pill once a diagram has lanes: the top lane says where it begins", () => {
    expect(renderDiagramSvg(NODES, EDGES)).toContain("Start here");
    expect(renderDiagramSvg(NODES, EDGES, { view: { lanes: LANES } })).not.toContain("Start here");
    expect(renderDiagramSvg(NODES, EDGES, { view: { lanes: LANES }, start: { x: 640, y: 420 } })).not.toContain("Start here");
  });
});
