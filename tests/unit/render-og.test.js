import { describe, it, expect } from "vitest";
import { renderOgSvg, OG_W, OG_H } from "../../lib/render-og.js";
import { tierFor } from "../../src/difficulty.js";
import appIcon from "../../lib/app-icon-data.js";

const DESIGN = {
  title: "Email Newsletter - 500M Subscribers",
  pattern: "Bulk fan-out: shard the audience, queue per shard",
  difficulty: 4,
  nodes: [
    { id: "client", position: { x: 0, y: 0 } },
    { id: "ses", position: { x: 300, y: 0 } },
    { id: "redis", position: { x: 600, y: 0 } },
  ],
  edges: [
    { source: "client", target: "ses", label: "send" },
    { source: "ses", target: "redis", label: "suppress" },
  ],
};

describe("renderOgSvg", () => {
  // The share card and the gallery card MUST agree. They were separate copies and
  // had already drifted: the card's table stopped at 10, so the two hardest demos
  // (ranks 11 and 12) shipped with no difficulty chip at all.
  it("shows a difficulty chip for every rank the gallery ranks, 1 through 12", () => {
    for (let d = 1; d <= 12; d++) {
      const svg = renderOgSvg({ ...DESIGN, difficulty: d });
      const expected = tierFor(d).label;
      expect(svg, `rank ${d} should chip as ${expected}`).toContain(expected);
    }
  });

  it("shows no chip when a design is unranked", () => {
    const svg = renderOgSvg({ ...DESIGN, difficulty: null });
    for (const label of ["Easy", "Medium", "Hard", "Expert"]) expect(svg).not.toContain(label);
  });

  it("puts the diagram in a panel beside the text column", () => {
    const svg = renderOgSvg(DESIGN);
    const m = /<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" rx="20" fill="#ffffff"/.exec(svg);
    expect(m).not.toBeNull();
    const [, x, y, w, h] = m.map(Number);
    expect(x).toBeGreaterThan(OG_W / 2 - 100);
    expect(x + w).toBeLessThanOrEqual(OG_W);
    expect(y + h).toBeLessThanOrEqual(OG_H);
  });

  it("renders a 1200x630 card", () => {
    const svg = renderOgSvg(DESIGN);
    expect(svg).toContain(`width="${OG_W}" height="${OG_H}"`);
  });

  // The picture is what a recipient looks at; a card with no name on it reads
  // as a random screenshot. Same as the Stickies card: title big, context under.
  it("draws the title and the pattern line on the card", () => {
    const svg = renderOgSvg(DESIGN);
    // The title wraps, so check the words rather than the whole string.
    expect(svg).toContain("Email Newsletter");
    expect(svg).toContain("Subscribers");
    expect(svg).toContain("Bulk fan-out");
  });

  it("wraps a long title onto at most 3 lines and marks the cut", () => {
    const long = "A very long diagram title that keeps going and going well past what fits in the column at all";
    const svg = renderOgSvg({ ...DESIGN, title: long });
    const titleLines = svg.match(/font-weight="700" fill="#16191d"/g).length;
    expect(titleLines).toBe(3);
    expect(svg).toContain("…");
  });

  it("escapes markup in the title", () => {
    const svg = renderOgSvg({ ...DESIGN, title: "Cache <redis> & friends" });
    expect(svg).toContain("&lt;redis&gt;");
    expect(svg).toContain("&amp;");
    expect(svg).not.toContain("<redis>");
  });

  // A 40-node design scaled to fit the panel is a smudge. The window zooms in
  // to a legible scale and shows the middle of the design instead.
  it("zooms a big diagram to a readable window instead of shrinking it to fit", () => {
    const big = Array.from({ length: 40 }, (_, i) => ({ id: `n${i}`, label: `Node ${i}`, position: { x: (i % 8) * 340, y: Math.floor(i / 8) * 270 } }));
    const svg = renderOgSvg({ ...DESIGN, nodes: big, edges: [] });
    const inner = /<svg x="[^"]+" y="[^"]+" width="([^"]+)" height="[^"]+" viewBox="([^"]+)"/.exec(svg);
    const panelW = Number(inner[1]);
    const winW = Number(inner[2].split(" ")[2]);
    expect(panelW / winW).toBeGreaterThanOrEqual(0.33);
  });

  it("shows the node and edge counts plus a difficulty chip", () => {
    const svg = renderOgSvg(DESIGN);
    expect(svg).toContain("3 nodes");
    expect(svg).toContain("2 edges");
    expect(svg).toContain("Medium");
  });

  it("nests the diagram itself, so the card previews the real design", () => {
    const svg = renderOgSvg(DESIGN);
    // A nested <svg> with its own viewBox is the diagram render.
    expect(svg.match(/<svg/g).length).toBeGreaterThan(1);
    expect(svg).toContain('preserveAspectRatio="xMidYMid meet"');
  });

  it("drops the Destination pill so the card matches what the app draws", () => {
    const svg = renderOgSvg({ ...DESIGN, nodes: [...DESIGN.nodes] });
    expect(svg).toContain("Start here");
    expect(svg).not.toContain("Destination");
  });

  it("uses the real-world brand logo when the title has one", () => {
    const withBrand = renderOgSvg({ ...DESIGN, title: "Bitly" });
    const without = renderOgSvg({ ...DESIGN, title: "Something Unbranded" });
    // The brand mark takes the app icon's place in the brand row.
    expect(without).toContain(appIcon);
    expect(withBrand).not.toContain(appIcon);
    expect(withBrand).toContain("<image ");
  });

  it("never emits raw markup from a title, even though it is not drawn", () => {
    const svg = renderOgSvg({ ...DESIGN, title: '<script>x</script> & "co"' });
    expect(svg).not.toContain("<script>");
  });

  it("survives a design with no nodes rather than throwing", () => {
    const svg = renderOgSvg({ title: "Empty", nodes: [], edges: [] });
    expect(svg).toContain(`width="${OG_W}"`);
    expect(svg).toContain("0 nodes");
  });
});
