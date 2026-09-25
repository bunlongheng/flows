import { describe, it, expect } from "vitest";
import { validateDesign, okCustomIcon, okColor, MAX_NODES } from "../../lib/validate-design.js";

// One policy for the 3 doors that write a diagram (API, MCP, AI generate).
describe("okCustomIcon", () => {
  it("accepts a same-origin asset path, https, and a well-formed data:image URI", () => {
    for (const ic of ["/brand/x.svg", "/icons/aws/s3.png", "https://cdn.example.com/logo.png", "data:image/png;base64,iVBORw0KGgo=", "data:image/svg+xml,%3Csvg"]) {
      expect(okCustomIcon(ic), ic).toBe(true);
    }
  });
  it("rejects protocol-relative, script, http, unknown image types and non-assets", () => {
    for (const ic of ["//evil.example/logo.svg", "javascript:alert(1)", "http://x/y.png", "data:image/bmp;base64,AAAA", "data:image/png", "/brand/../../etc/passwd", "/brand/x.html", 42, ""]) {
      expect(okCustomIcon(ic), String(ic)).toBe(false);
    }
  });
});

describe("okColor", () => {
  it("is a 6-digit hex or nothing (it lands in SVG attributes)", () => {
    expect(okColor("#FE5100")).toBe(true);
    for (const c of ['red', '#fff', '#FE5100" onload="x', "", null]) expect(okColor(c), String(c)).toBe(false);
  });
});

describe("validateDesign", () => {
  it("passes a catalog node and a bring-your-own icon", () => {
    expect(validateDesign({ nodes: [{ id: "user" }, { id: "hub", icon: "/brand/hubspot.svg", label: "HubSpot" }], edges: [{ source: "user", target: "hub" }] })).toBeNull();
  });
  it("names every unresolved node once", () => {
    const v = validateDesign({ nodes: [{ id: "ghost" }, { id: "ghost" }, { id: "user" }, { id: "x", icon: "//evil/x.svg" }], edges: [] });
    expect(v.unresolved).toEqual(["ghost", "x"]);
    expect(v.error).toMatch(/real logo/);
  });
  it("enforces the icon size and node/edge caps", () => {
    expect(validateDesign({ nodes: [{ id: "a", icon: "data:image/png;base64," + "A".repeat(24001) }], edges: [] }).error).toMatch(/too large/);
    expect(validateDesign({ nodes: Array.from({ length: MAX_NODES + 1 }, () => ({ id: "user" })), edges: [] }).error).toMatch(/too many nodes/);
    expect(validateDesign({ nodes: [{ id: "user" }], edges: [{ source: "user" }] }).error).toMatch(/source.*target/);
  });
});

// A PNG data: URI with only the header, which is all the size check reads.
const png = (w, h) => {
  const b = Buffer.alloc(33);
  b.write("\x89PNG\r\n\x1a\n", 0, "binary");
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12, "ascii");
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return `data:image/png;base64,${b.toString("base64")}`;
};

describe("validateDesign - pasted icons", () => {
  it("rejects a favicon-sized inline icon on a custom node", () => {
    const r = validateDesign({ nodes: [{ id: "mbd-market", label: "MBD", icon: png(16, 16) }] });
    expect(r.error).toMatch(/"mbd-market" is smaller than 96px/);
  });

  it("accepts an inline icon at or above 96px, and any SVG", () => {
    expect(validateDesign({ nodes: [{ id: "x1", label: "X", icon: png(96, 96) }] })).toBeNull();
    expect(validateDesign({ nodes: [{ id: "x2", label: "X", icon: "data:image/svg+xml;base64,PHN2Zz4=" }] })).toBeNull();
  });

  it("strips a pasted icon and colour off a catalog id instead of storing it", () => {
    // How Integry kept arriving grey: an agent pasted a 16x16 favicon on a
    // catalog id. The catalog logo wins, so the junk never reaches the row.
    const n = { id: "integry", label: "Integry", icon: png(16, 16), color: "#9aa0a6" };
    expect(validateDesign({ nodes: [n] })).toBeNull();
    expect(n.icon).toBeUndefined();
    expect(n.color).toBeUndefined();
  });
});
