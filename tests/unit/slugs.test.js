import { describe, it, expect } from "vitest";
import { toSlug } from "../../lib/slugs.js";

describe("toSlug", () => {
  it("slugifies a title", () => {
    expect(toSlug("Netflix Video Streaming")).toBe("netflix-video-streaming");
    expect(toSlug("Uber @ Scale!!")).toBe("uber-scale");
  });
  it("falls back to 'untitled' for empty input", () => {
    expect(toSlug("")).toBe("untitled");
    expect(toSlug("   ")).toBe("untitled");
    expect(toSlug(null)).toBe("untitled");
  });
});
