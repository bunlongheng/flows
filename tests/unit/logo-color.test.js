import { describe, it, expect } from "vitest";
import { isNeutral, logoColor, fixNeutralColors } from "../../lib/logo-color.js";

const svg = (fill) =>
  "data:image/svg+xml;base64," +
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="${fill}" d="M0 0h24v24H0z"/></svg>`).toString("base64");

describe("isNeutral", () => {
  it("calls black, grey and white neutral and a brand colour not", () => {
    expect(isNeutral("#1a1d1f")).toBe(true);
    expect(isNeutral("#8e8e93")).toBe(true);
    expect(isNeutral("#ffffff")).toBe(true);
    expect(isNeutral("#ED5524")).toBe(false);
    expect(isNeutral("#0f766e")).toBe(false);
    expect(isNeutral(undefined)).toBe(false);
  });
});

describe("logoColor", () => {
  it("reads an SVG logo's fill and gives up on anything else", async () => {
    expect((await logoColor(svg("#ED5524"))).toLowerCase()).toBe("#ed5524");
    expect(await logoColor("auth0")).toBe(null);
    expect(await logoColor("data:image/webp;base64,AAAA")).toBe(null);
  });
});

describe("fixNeutralColors", () => {
  it("swaps a near-black on a colourful logo for the logo colour and leaves the rest", async () => {
    const out = await fixNeutralColors([
      { id: "a", icon: svg("#ED5524"), color: "#1a1d1f" },
      { id: "b", icon: svg("#ED5524"), color: "#0f766e" },
      { id: "c", icon: svg("#191919"), color: "#1a1d1f" },
      { id: "d", color: "#1a1d1f" },
      { id: "e", icon: svg("#ED5524") },
    ]);
    expect(out[0].color.toLowerCase()).toBe("#ed5524");
    expect(out[1].color).toBe("#0f766e");
    expect(out[2].color).toBe("#1a1d1f");
    expect(out[3].color).toBe("#1a1d1f");
    expect(out[4].color).toBeUndefined();
  });
});
