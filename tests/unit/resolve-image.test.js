import { describe, it, expect, vi } from "vitest";
import sharp from "sharp";
import { toNodeImage, resolveNodeImages, okImageSource, IMAGE_W, IMAGE_H, MAX_IMAGE_CHARS } from "../../lib/resolve-image.js";

const png = (w, h) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 100, b: 50 } } }).png().toBuffer();

describe("okImageSource", () => {
  it("accepts data:, https, airclips: and an absolute file path", () => {
    for (const s of [
      "data:image/png;base64,iVBORw0KGgo=",
      "https://cdn.example.com/shot.png",
      "airclips:abc123",
      "airclips:latest",
      "AIRCLIPS:LATEST",
      "/Users/bheng/Desktop/shot.png",
    ]) {
      expect(okImageSource(s), s).toBe(true);
    }
  });
  it("rejects everything else", () => {
    for (const s of ["ftp://x", "http://x.png", "relative/x.png", "/no-ext", 42, null, undefined]) {
      expect(okImageSource(s), String(s)).toBe(false);
    }
  });
});

describe("toNodeImage", () => {
  it("resizes to 640x480 cover-cropped JPEG under the char budget", async () => {
    const bytes = await png(1200, 900);
    const uri = await toNodeImage(bytes);
    expect(uri.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(uri.length).toBeLessThan(MAX_IMAGE_CHARS);
    const b64 = uri.slice(uri.indexOf(",") + 1);
    const meta = await sharp(Buffer.from(b64, "base64")).metadata();
    expect(meta.width).toBe(IMAGE_W);
    expect(meta.height).toBe(IMAGE_H);
    expect(meta.format).toBe("jpeg");
  });
});

describe("resolveNodeImages", () => {
  it("keeps an already-stored 640x480 JPEG byte-identical (no re-encode on a get -> update round trip)", async () => {
    const bytes = await png(1200, 900);
    const uri = await toNodeImage(bytes);
    const { nodes, failed } = await resolveNodeImages([{ id: "shot", image: uri }]);
    expect(failed).toEqual([]);
    expect(nodes[0].image).toBe(uri);
  });

  it("calls loaders.file with the given path and stores the result as a JPEG data URI", async () => {
    const bytes = await png(800, 600);
    const file = vi.fn().mockResolvedValue(bytes);
    const { nodes, failed } = await resolveNodeImages([{ id: "shot", image: "/Users/bheng/Desktop/shot.png" }], { file });
    expect(file).toHaveBeenCalledWith("/Users/bheng/Desktop/shot.png");
    expect(failed).toEqual([]);
    expect(nodes[0].image.startsWith("data:image/jpeg;base64,")).toBe(true);
  });

  it("calls loaders.airclips with the ref stripped of the prefix and stores the result", async () => {
    const bytes = await png(800, 600);
    const airclips = vi.fn().mockResolvedValue(bytes);
    const { nodes, failed } = await resolveNodeImages([{ id: "shot", image: "airclips:deadbeef" }], { airclips });
    expect(airclips).toHaveBeenCalledWith("deadbeef");
    expect(failed).toEqual([]);
    expect(nodes[0].image.startsWith("data:image/jpeg;base64,")).toBe(true);
  });

  it("fails a blocked-host https source with a reason and drops image from the node", async () => {
    const { nodes, failed } = await resolveNodeImages([{ id: "shot", image: "https://localhost/x.png" }]);
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ id: "shot" });
    expect(failed[0].reason).toBeTruthy();
    expect(nodes[0]).not.toHaveProperty("image");
  });

  it("fails airclips:latest with the MCP-only reason when no loader is given", async () => {
    const { nodes, failed } = await resolveNodeImages([{ id: "shot", image: "airclips:latest" }]);
    expect(failed).toEqual([{ id: "shot", reason: "airclips refs work through the MCP only" }]);
    expect(nodes[0]).not.toHaveProperty("image");
  });
});
