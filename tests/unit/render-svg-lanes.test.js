import { describe, it, expect } from "vitest";
import { renderDiagramSvg } from "../../lib/render-svg.js";
import { LANE_PAD } from "../../src/lanes.js";

const NODES = [{ id: "client", position: { x: 0, y: 0 } }, { id: "ses", position: { x: 300, y: 400 } }];
const EDGES = [{ source: "client", target: "ses", label: "webhook" }];
const LANES = [{ id: "a", title: "Visitor", y: -60, h: 300 }, { id: "b", title: "Inbox", y: 340, h: 300, color: "#dc2626" }];

describe("renderDiagramSvg - swimlanes", () => {
  it("draws each lane as a bordered band the width of the cards plus padding, titled as written", () => {
    const svg = renderDiagramSvg(NODES, EDGES, { view: { lanes: LANES } });
    expect(svg.match(/class="sd-lane"/g)).toHaveLength(2);
    expect(svg).toContain(`<rect x="${-LANE_PAD}.0" y="-60.0" width="${480 + 2 * LANE_PAD}.0" height="300.0" rx="10" fill="#64748b" fill-opacity="0.05" stroke="#64748b" stroke-opacity="0.35" stroke-width="1.5"/>`);
    expect(svg).toContain('stroke="#dc2626" stroke-opacity="0.35" stroke-width="1.5"');
    expect(svg).toContain(">Visitor</text>");
    expect(svg).toContain('fill="#dc2626">Inbox</text>');
  });
  it("sizes the title from the lane's size, 13 px when it says nothing", () => {
    const svg = renderDiagramSvg(NODES, EDGES, { view: { lanes: [LANES[0], { ...LANES[1], size: 20 }] } });
    expect(svg).toContain('y="-38.0" font-size="13" font-weight="800" letter-spacing="0.2" fill="#64748b">Visitor</text>');
    expect(svg).toContain('y="309.0" font-size="20" font-weight="800" letter-spacing="0.2" fill="#dc2626">Inbox</text>');
  });
  it("draws nothing extra without lanes, and the picture grows to hold a lane", () => {
    expect(renderDiagramSvg(NODES, EDGES)).not.toContain("sd-lane");
    const tall = renderDiagramSvg(NODES, EDGES, { view: { lanes: [{ id: "a", title: "t", y: 700, h: 1200 }] } }); // an empty lane keeps its size
    const h = Number(/viewBox="[-\d.]+ [-\d.]+ [\d.]+ ([\d.]+)"/.exec(tall)[1]);
    expect(h).toBeGreaterThanOrEqual(1900);
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

describe("renderDiagramSvg - lane edges", () => {
  it("drops a lane-bound line straight from its card onto the lane border, in the lane colour", () => {
    const svg = renderDiagramSvg(NODES, [{ source: "client", target: "lane:b", label: "all of them" }], { view: { lanes: LANES } });
    const g = svg.match(/<linearGradient id="grad-0"[^>]*x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)"><stop[^>]*\/><stop offset="100%" stop-color="([^"]+)"/);
    expect(g).not.toBeNull();
    expect(g[1]).toBe(g[3]); // straight drop: same x at both ends
    expect(Number(g[4])).toBe(280); // packLanes tucks lane b under a, so its top border is where the line ends
    expect(g[5]).toBe("#dc2626");
    expect(svg).toContain("all of them");
  });
  it("marks the lane end with a solid port and lights the band when the dots land, like a card", () => {
    const edges = [{ source: "client", target: "lane:b", label: "all of them" }];
    const still = renderDiagramSvg(NODES, edges, { view: { lanes: LANES } });
    expect(still).toContain('<circle cx="90.0" cy="280.0" r="5" fill="#dc2626" stroke="#fff"');
    expect(still).not.toContain("sd-lane-glow");
    const landing = renderDiagramSvg(NODES, edges, { view: { lanes: LANES }, dotPhase: 0 });
    expect(landing.match(/sd-lane-glow/g)).toHaveLength(1); // lane b only, lane a is nobody's target
    expect(landing).toMatch(/sd-lane-glow"><rect [^>]*stroke="#dc2626"/);
    expect(renderDiagramSvg(NODES, edges, { view: { lanes: LANES }, dotPhase: 0.5 })).not.toContain("sd-lane-glow"); // mid-trip, nothing lands
  });
});
