// Picture nodes: a node's `image` field is resolved ONCE at create/update time
// into a 640x480 JPEG data URI stored inside the node - the same way
// lib/resolve-icon.js inlines https icons today. 4 sources: an absolute file
// path (MCP only, via loaders.file), a data:image base64 URI, an https URL, or
// an AirClips clip (airclips:<id> or airclips:latest, via loaders.airclips).
import sharp from "sharp";
import { blockedHost } from "./resolve-icon.js";

export const IMAGE_W = 640, IMAGE_H = 480, MAX_IMAGE_CHARS = 200000;
const MAX_FETCH_BYTES = 8 * 1024 * 1024; // 8 MB

const DATA_RE = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/;
const AIRCLIPS_RE = /^airclips:([0-9a-f]{6,}|latest)$/i;
const FILE_RE = /^\/[^\s]+\.(png|jpe?g|webp|gif|heic)$/i;

export const okImageSource = (s) =>
  typeof s === "string" &&
  (DATA_RE.test(s) || /^https:\/\//.test(s) || AIRCLIPS_RE.test(s) || FILE_RE.test(s));

// Resize/crop to the stored picture size and re-encode as JPEG. Re-encodes at a
// lower quality when the first pass would blow the row up past MAX_IMAGE_CHARS.
export async function toNodeImage(bytes) {
  const base = sharp(bytes).rotate().resize(IMAGE_W, IMAGE_H, { fit: "cover", position: "centre" });
  let buf = await base.clone().jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  let b64 = buf.toString("base64");
  if (b64.length > MAX_IMAGE_CHARS) {
    buf = await base.clone().jpeg({ quality: 60, mozjpeg: true }).toBuffer();
    b64 = buf.toString("base64");
  }
  return `data:image/jpeg;base64,${b64}`;
}

// Fetch a remote https image and return its bytes, or throw a reason.
async function fetchHttpsImage(url) {
  let u;
  try { u = new URL(url); } catch { throw new Error("not a valid URL"); }
  if (u.protocol !== "https:" || blockedHost(u.hostname)) throw new Error("host refused");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetch(url, { redirect: "error", signal: ctrl.signal, headers: { Accept: "image/*" } });
    if (!r.ok) throw new Error(`fetch failed (${r.status})`);
    const ct = (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!/^image\//.test(ct)) throw new Error(`not an image (${ct || "no content-type"})`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length === 0) throw new Error("empty body");
    if (buf.length > MAX_FETCH_BYTES) throw new Error("image too large (max 8MB)");
    return buf;
  } finally {
    clearTimeout(timer);
  }
}

// A stored picture is already 640x480 JPEG - skip re-encoding a get_flow ->
// update_flow round trip so the row doesn't churn on every save.
async function isAlreadyStoredImage(uri) {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(uri);
  if (!m) return false;
  try {
    const meta = await sharp(Buffer.from(m[1], "base64")).metadata();
    return meta.width === IMAGE_W && meta.height === IMAGE_H && meta.format === "jpeg";
  } catch {
    return false;
  }
}

// Resolve every node's `image` source to an inlined 640x480 JPEG data URI.
// Returns { nodes, failed }: `failed` is [{ id, reason }] for a node whose
// image could not be loaded - that node's `image` field is dropped.
export async function resolveNodeImages(nodes, loaders = {}) {
  const failed = [];
  const resolved = await Promise.all(
    nodes.map(async (n) => {
      if (typeof n.image !== "string" || !n.image) return n;
      const src = n.image;
      try {
        if (await isAlreadyStoredImage(src)) return n;
        let bytes;
        if (DATA_RE.test(src)) {
          bytes = Buffer.from(DATA_RE.exec(src)[2], "base64");
        } else if (/^https:\/\//.test(src)) {
          bytes = await fetchHttpsImage(src);
        } else if (AIRCLIPS_RE.test(src)) {
          if (typeof loaders.airclips !== "function") throw new Error("airclips refs work through the MCP only");
          bytes = await loaders.airclips(AIRCLIPS_RE.exec(src)[1]);
        } else if (FILE_RE.test(src)) {
          if (typeof loaders.file !== "function") throw new Error("file paths work through the MCP only");
          bytes = await loaders.file(src);
        } else {
          throw new Error("not a usable image source");
        }
        if (!bytes) throw new Error("no image data");
        const image = await toNodeImage(bytes);
        return { ...n, image };
      } catch (e) {
        failed.push({ id: n.id, reason: String((e && e.message) || e) });
        const { image: _image, ...rest } = n;
        return rest;
      }
    }),
  );
  return { nodes: resolved, failed };
}
