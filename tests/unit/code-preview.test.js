import { describe, it, expect } from "vitest";
import { previewCode } from "../../src/codePreview.js";

const ICON = "data:image/svg+xml;base64," + "A".repeat(3000);
const DATA = { nodes: [{ id: "gmail", icon: ICON }, { id: "ses" }], edges: [{ source: "ses", target: "gmail", label: "mail" }] };

describe("previewCode", () => {
  it("shortens every data URI to its head and length, and leaves everything else as pretty JSON", () => {
    const out = previewCode(DATA);
    expect(out).toContain(`"icon": "data:image/svg+xml;base64,${"A".repeat(24)}... ${ICON.length} chars"`);
    expect(out).not.toContain("A".repeat(25));
    expect(out).toContain('"label": "mail"');
    expect(out.split("\n").length).toBe(JSON.stringify(DATA, null, 2).split("\n").length);
  });
  it("is the identity for a diagram without inline icons", () => {
    const plain = { nodes: [{ id: "ses", label: "https://example.com/a.png" }], edges: [] };
    expect(previewCode(plain)).toBe(JSON.stringify(plain, null, 2));
  });
});
