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

import { tokenizeCode } from "../../src/codePreview.js";

describe("tokenizeCode", () => {
  it("tells keys from strings, numbers, literals and punctuation, and joins back to the input", () => {
    const text = '{\n  "id": "gmail",\n  "x": -12.5,\n  "on": true,\n  "note": null\n}';
    const toks = tokenizeCode(text);
    expect(toks.map(t => t.text).join("")).toBe(text);
    const kinds = Object.fromEntries(toks.filter(t => t.kind !== "plain").map(t => [t.text, t.kind]));
    expect(kinds['"id"']).toBe("key");
    expect(kinds['"gmail"']).toBe("string");
    expect(kinds["-12.5"]).toBe("number");
    expect(kinds["true"]).toBe("literal");
    expect(kinds["null"]).toBe("literal");
    expect(kinds["{"]).toBe("punct");
  });
  it("keeps a shortened icon as 1 string token", () => {
    const toks = tokenizeCode(previewCode({ icon: "data:image/png;base64," + "B".repeat(100) }));
    expect(toks.filter(t => t.kind === "string")).toHaveLength(1);
  });
});

import { clampWidth, PANEL_MIN } from "../../src/panelWidth.js";

describe("clampWidth", () => {
  it("keeps a panel between the minimum and 80 percent of the window", () => {
    expect(clampWidth(100, 1500)).toBe(PANEL_MIN);
    expect(clampWidth(500.4, 1500)).toBe(500);
    expect(clampWidth(5000, 1500)).toBe(1200);
  });
});
