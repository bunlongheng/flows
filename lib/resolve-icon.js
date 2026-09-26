// Bring-your-own-icon: a caller may pass a remote https icon URL on a node. We
// fetch it ONCE at create time and inline it as a data: URI, so the stored diagram
// is self-contained (no CSP relaxation, no broken icons if their host dies, no
// per-view request to a third party). Catalog ids, /paths and data: URIs pass
// through untouched.

const MAX_BYTES = 24000; // keep rows lean; ~24KB is plenty for an SVG/PNG logo

const isRemote = (ic) => typeof ic === "string" && /^https:\/\//i.test(ic);

// Best-effort SSRF guard: refuse obvious internal / metadata hosts.
export function blockedHost(host) {
  const h = (host || "").toLowerCase();
  return (
    h === "localhost" || h === "0.0.0.0" || h === "::1" ||
    h.endsWith(".local") || h.endsWith(".internal") ||
    /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) ||
    /^169\.254\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)
  );
}

// Fetch a remote https image and return it as a data: URI, or null on any problem.
export const MIN_PX = 96; // node icons draw at 48 CSS px -> 96 device px on retina

// Width/height straight out of the file header - no decoding, no dependency.
// Anything whose header we cannot read is let through rather than wrongly
// rejected; this is a quality guard, not a security one.
function bigEnough(buf, ct) {
  try {
    if (ct === "image/png" && buf.length > 24 && buf.toString("ascii", 12, 16) === "IHDR") {
      return buf.readUInt32BE(16) >= MIN_PX && buf.readUInt32BE(20) >= MIN_PX;
    }
    if (ct === "image/jpeg") {
      let i = 2;
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) { i += 1; continue; }
        const m = buf[i + 1];
        // SOF0..SOF15, skipping the non-frame markers in that range.
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
          return buf.readUInt16BE(i + 7) >= MIN_PX && buf.readUInt16BE(i + 5) >= MIN_PX;
        }
        i += 2 + buf.readUInt16BE(i + 2);
      }
    }
  } catch { /* unreadable header - do not block on it */ }
  return true;
}

// The same floor for a PASTED data: icon. Remote URLs were already held to
// MIN_PX, but an inline 16x16 favicon walked straight past it. Only base64
// PNG/JPEG headers are read; SVG and anything unreadable pass.
export function dataIconBigEnough(uri) {
  const m = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)/.exec(uri || "");
  if (!m) return true;
  return bigEnough(Buffer.from(m[2], "base64"), m[1]);
}

export async function inlineRemoteIcon(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== "https:" || blockedHost(u.hostname)) return null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    // redirect:"error" so a URL can't bounce to an internal host after our check.
    const r = await fetch(url, { redirect: "error", signal: ctrl.signal, headers: { Accept: "image/*" } });
    if (!r.ok) return null;
    const ct = (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!/^image\/(png|jpeg|svg\+xml|webp|gif)$/.test(ct)) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_BYTES) return null;
    // A raster logo below MIN_PX renders visibly soft: node icons draw at 48px,
    // which is 96 real pixels on a retina screen. Vector is exempt - an SVG is
    // sharp at any size, and plenty of good ones are only a few hundred bytes.
    if (ct !== "image/svg+xml" && !bigEnough(buf, ct)) return null;
    return `data:${ct};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Resolve remote-URL icons on nodes to inlined data: URIs. Returns { nodes,
// failed } - `failed` lists node ids whose remote icon could not be fetched so
// the caller can reject with a clear error.
export async function resolveNodeIcons(nodes) {
  const failed = [];
  const resolved = await Promise.all(
    nodes.map(async (n) => {
      if (!isRemote(n.icon)) return n;
      const inlined = await inlineRemoteIcon(n.icon);
      if (!inlined) { failed.push(n.id); return { ...n, icon: undefined }; }
      return { ...n, icon: inlined };
    }),
  );
  return { nodes: resolved, failed };
}
