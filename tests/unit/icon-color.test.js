import { describe, it, expect } from "vitest";
import { colorFromIcon } from "../../src/iconColor.js";

// A node is drawn in ONE colour - box tint, border, the dotted edge leaving it
// and the dot travelling that edge - and that colour comes from its own logo.
// These pin the reading, because getting it wrong is silent: the diagram still
// renders, just in the wrong brand colour.

const svg = (body) => "data:image/svg+xml;base64," + Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg">${body}</svg>`).toString("base64");

describe("colorFromIcon", () => {
  it("reads the one brand colour a single-colour logo states", () => {
    expect(colorFromIcon(svg('<path fill="#4285F4" d="M0 0h1v1H0z"/>'))).toBe("#4285f4");
  });

  it("ignores white, which is the canvas behind a logo and never the logo", () => {
    expect(colorFromIcon(svg('<rect fill="#FFFFFF"/><path fill="#4eaa25"/>'))).toBe("#4eaa25");
  });

  it("prefers a saturated colour over the greys used for strokes and text", () => {
    expect(colorFromIcon(svg('<path fill="#333333"/><path fill="#333333"/><path fill="#d97757"/>')))
      .toBe("#d97757");
  });

  it("still answers for an all-black mark like Next.js, rather than giving up", () => {
    expect(colorFromIcon(svg('<path fill="#000000" d="M0 0"/>'))).toBe("#000000");
  });

  it("breaks a tie by what is drawn FIRST, not by Map order", () => {
    // Linode's mark: a dark green shadow and the brand green, once each. Sorting
    // on count alone left the winner to iteration order and picked the shadow.
    const linode = svg('<path fill="#33b652"/><path fill="#123d10"/><path fill="#231f20"/>');
    expect(colorFromIcon(linode)).toBe("#33b652");
    // Same colours, drawn in the other order - the first one still wins.
    const flipped = svg('<path fill="#123d10"/><path fill="#33b652"/><path fill="#231f20"/>');
    expect(colorFromIcon(flipped)).toBe("#123d10");
  });

  it("count still beats position when one colour actually dominates", () => {
    const s = svg('<path fill="#123d10"/><path fill="#33b652"/><path fill="#33b652"/>');
    expect(colorFromIcon(s)).toBe("#33b652");
  });

  it("is stable across calls, so a diagram cannot change colour on a reload", () => {
    const s = svg('<path fill="#520bf5"/><path fill="#9d1fe0"/><path fill="#e540ae"/>');
    expect(colorFromIcon(s)).toBe(colorFromIcon(s));
  });

  it("expands shorthand hex, which several simple-icons use", () => {
    expect(colorFromIcon(svg('<path fill="#0f0"/>'))).toBe("#00ff00");
  });

  it("says nothing for a logo with no colour of its own", () => {
    expect(colorFromIcon(svg('<path fill="currentColor"/>'))).toBeNull();
    expect(colorFromIcon("/icons/lambda.svg")).toBeNull();   // a path, not inline
    expect(colorFromIcon("")).toBeNull();
    expect(colorFromIcon(null)).toBeNull();
  });
});
