import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// The pinned callout must show all the time, not only on hover. It shares
// ::after with the hover tooltip, so its rule has to come later AND be 1 class
// stronger, or the hover rule's opacity: 0 wins (the 2026-10-13 bug).
describe("pinned callout CSS", () => {
  const css = readFileSync("src/views/DetailView.jsx", "utf8");
  it("is always visible and outranks the hover tooltip rule", () => {
    const hover = css.indexOf(".sd-card-tip[data-tip]::after {");
    const pin = css.indexOf(".sd-card-tip.sd-card-tip-pin[data-tip]::after {");
    expect(hover).toBeGreaterThan(-1);
    expect(pin).toBeGreaterThan(hover);
    expect(css.slice(pin, css.indexOf("}", pin))).toMatch(/opacity: 1; visibility: visible;/);
  });
});
