import { describe, it, expect } from "vitest";
import { isNeutral, logoColor, defaultIconColors } from "../../lib/logo-color.js";

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

describe("defaultIconColors", () => {
  it("takes the colour off the icon unless the node carries an explicit one", async () => {
    const out = await defaultIconColors([
      { id: "a", icon: svg("#ED5524"), color: "#1a1d1f" }, // near-black loses to the logo
      { id: "b", icon: svg("#ED5524"), color: "#0f766e" }, // a picked colour wins
      { id: "c", icon: svg("#191919"), color: "#1a1d1f" }, // a logo with no colour changes nothing
      { id: "d", color: "#1a1d1f" }, // no icon, nothing to read
      { id: "e", icon: svg("#ED5524") }, // no colour at all: the icon decides
      { id: "f", icon: svg("#ECD53F") }, // the .env case: yellow icon, yellow border
    ]);
    expect(out[0].color.toLowerCase()).toBe("#ed5524");
    expect(out[1].color).toBe("#0f766e");
    expect(out[2].color).toBe("#1a1d1f");
    expect(out[3].color).toBe("#1a1d1f");
    expect(out[4].color.toLowerCase()).toBe("#ed5524");
    expect(out[5].color.toLowerCase()).toBe("#ecd53f");
  });
});
