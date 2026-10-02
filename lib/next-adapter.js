import { after as runAfter } from "next/server";

// The 12 API handlers in lib/handlers are written against Express-style
// (req, res). Rewriting them for Next's Request/Response would have thrown away
// the 32 unit-test files that mock exactly that shape.
//
// So they are kept verbatim and adapted here instead: one small shim, one place
// to get right, and every existing handler test still exercises shipping code.
// isLocal() checks the PEER SOCKET ADDRESS on purpose - a Host header is
// spoofable, a TCP source address is not. Next route handlers do not expose the
// socket, so it is reconstructed here.
//
// Only in development. In production isLocal() returns false before it ever
// reads this (unless LOCAL_DEV is explicitly set), so a forged header cannot
// open anything - and leaving it blank there keeps that guarantee obvious.
function peerAddress(request) {
  if (process.env.NODE_ENV === "production") return "";
  const fwd = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "";
  // A dev server binds loopback (or the LAN with --host), and isLocal accepts
  // both, so falling back to loopback matches what is actually true.
  return fwd.split(",")[0].trim() || "127.0.0.1";
}

export function toRoute(handler) {
  return async function route(request, ctx) {
    const url = new URL(request.url);
    const params = ctx?.params ? await ctx.params : {};
    const query = { ...Object.fromEntries(url.searchParams), ...params };

    let body;
    if (request.method !== "GET" && request.method !== "HEAD") {
      try {
        const text = await request.text();
        body = text ? JSON.parse(text) : undefined;
      } catch { body = undefined; }
    }

    const req = {
      // A HEAD is a GET whose body is thrown away. Handlers gate on GET, so it is
      // normalised here rather than in twelve places - several link-preview bots
      // send HEAD first, and a 405 there loses the preview.
      method: request.method === "HEAD" ? "GET" : request.method,
      url: url.pathname + url.search,
      query,
      params,
      body,
      headers: Object.fromEntries(request.headers),
      socket: { remoteAddress: peerAddress(request) },
      // Work that must outlive the response. Vercel freezes the function once
      // the body is sent, so a plain fire-and-forget promise is lost with it;
      // after() runs it once the response is out and the visitor is not held.
      // Outside a request scope (unit tests) after() throws, so the work runs
      // inline there instead.
      after(fn) { try { runAfter(fn); } catch { fn(); } },
    };

    // Collected, then turned into one Response - handlers call status()/json()/
    // send()/end() synchronously and expect chaining.
    let statusCode = 200;
    const headers = new Headers();
    let payload = null;
    let done;
    const finished = new Promise((r) => { done = r; });

    const res = {
      statusCode,
      status(code) { statusCode = code; this.statusCode = code; return this; },
      setHeader(k, v) { headers.set(k, String(v)); return this; },
      // Node-style writeHead, used by the auth redirects. It was missing after the
      // Next port, so /api/auth/login and /callback threw and the owner could not
      // sign in at all - the unit tests hid it because their res mock defines it.
      writeHead(code, hdrs = {}) {
        statusCode = code; this.statusCode = code;
        for (const [k, v] of Object.entries(hdrs)) for (const x of [].concat(v)) headers.append(k, String(x));
        return this;
      },
      getHeader(k) { return headers.get(k); },
      json(b) { headers.set("content-type", "application/json; charset=utf-8"); payload = JSON.stringify(b); done(); return this; },
      send(b) { payload = b; done(); return this; },
      end(b) { if (b !== undefined) payload = b; done(); return this; },
      redirect(code, location) {
        if (typeof code === "string") { location = code; code = 302; }
        statusCode = code; headers.set("location", location); payload = null; done(); return this;
      },
    };

    await handler(req, res);
    await finished;

    // Buffers must reach Response as bytes, not as a stringified object.
    const out = Buffer.isBuffer(payload) ? new Uint8Array(payload) : payload;
    // HEAD must carry the same headers and no body.
    return new Response(request.method === "HEAD" ? null : out, { status: statusCode, headers });
  };
}
