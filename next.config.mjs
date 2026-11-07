// Ported from vercel.json. Next serves the UI and the API from ONE process, so
// the Express server (serve.mjs) and the two-process dev wrapper are gone.
// The CSP is a static header below: no per-request nonce, so pages can be
// prerendered and served from the CDN instead of a function on every hit.
/** @type {import('next').NextConfig} */
import { readFileSync } from "node:fs";
// Fail-fast prod env check. It self-runs on import; this used to hang off
// vite.config.js, which the Next port deleted, so nothing ran it for a day.
import "./lib/env.js";
const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export default {
  env: { NEXT_PUBLIC_APP_VERSION: version },
  // resvg is a native module - it must not be bundled into the server chunk.
  serverExternalPackages: ["@resvg/resvg-js", "pg", "gifenc"],
  // The app was renamed from "system-design" to "flows" and the public API moved
  // with it. These keep every previously documented URL working. 308 (not 301)
  // so POST/PATCH/DELETE keep their method and body through the redirect.
  async redirects() {
    return [
      { source: "/api/ai/system-designs", destination: "/api/ai/flows", permanent: true },
      { source: "/api/ai/system-designs/:path*", destination: "/api/ai/flows/:path*", permanent: true },
      { source: "/api/system-designs", destination: "/api/flows", permanent: true },
      { source: "/api/system-designs/:path*", destination: "/api/flows/:path*", permanent: true },
    ];
  },
  // Shared links keep their /?id= and /?name= URLs; the rewrite sends them to
  // the dynamic /share route so the bare / stays static. beforeFiles, because
  // Vercel otherwise resolves / from the filesystem before rewrites run.
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", has: [{ type: "query", key: "id" }], destination: "/share" },
        { source: "/", has: [{ type: "query", key: "name" }], destination: "/share" },
      ],
    };
  },
  async headers() {
    const dev = process.env.NODE_ENV === "development";
    const csp = [
      "default-src 'self'",
      "img-src 'self' data: https://avatars.githubusercontent.com",
      "style-src 'self' 'unsafe-inline'",
      // 'unsafe-inline' is the price of a static page: Next's bootstrap is an
      // inline script and only a per-request nonce could whitelist it.
      `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
      "font-src 'self' data:",
      `connect-src 'self'${dev ? " ws: http://localhost:*" : ""}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
    ].join("; ");
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: csp },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Robots-Tag", value: "index, follow" },
      ],
    }];
  },
};
