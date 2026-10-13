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
  it("resizes to a 640x480 JPEG under the char budget", async () => {
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

  // Owner rule 2026-10-13: a screenshot is never cropped. A wide shot keeps its
  // left and right edges and gets white bars above and below instead.
  it("never crops: a wide image keeps both edges and is padded white", async () => {
    const w = 1600, h = 400;
    const raw = Buffer.alloc(w * h * 3, 0);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      if (x < 80) raw[i] = 255; else if (x >= w - 80) raw[i + 2] = 255; else raw[i + 1] = 255;
    }
    const bytes = await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
    const uri = await toNodeImage(bytes);
    const out = sharp(Buffer.from(uri.slice(uri.indexOf(",") + 1), "base64"));
    const { data, info } = await out.raw().toBuffer({ resolveWithObject: true });
    const px = (x, y) => { const i = (y * info.width + x) * info.channels; return [data[i], data[i + 1], data[i + 2]]; };
    const mid = Math.round(info.height / 2);
    const [lr, lg, lb] = px(5, mid); expect(lr).toBeGreaterThan(180); expect(lg).toBeLessThan(90); expect(lb).toBeLessThan(90);
    const [rr, rg, rb] = px(info.width - 6, mid); expect(rb).toBeGreaterThan(180); expect(rr).toBeLessThan(90); expect(rg).toBeLessThan(90);
    for (const c of px(info.width / 2, 5)) expect(c).toBeGreaterThan(240);
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
