// Who opened a shared link. This exact file ships in every app as
// lib/share-alert.js, with tests/unit/share-alert.test.js beside it. The
// canonical copy lives in github.com/bunlongheng/notify under client/, and
// scripts/check-clients.sh there fails on any drift. The only per-app input is
// env: NOTIFY_APP (this app's key in Notify's apps.json), NOTIFY_URL and
// NOTIFY_SECRET. Notify logs the view, numbers it, enriches the IP and emails
// the owner with this app's own icon and name.
//
// Never throws and never blocks the response: call notifyShareView after the
// response is sent (after(), waitUntil()) and never await it on the request path.

// Link-preview crawlers (iMessage, Slack, WhatsApp, Twitter, Facebook) fetch a
// shared URL without a person behind it, and so does a Playwright run.
export function isBot(userAgent) {
  return /bot|crawler|spider|preview|facebookexternalhit|slackbot|twitterbot|whatsapp|telegram|discord|skype|linkedin|embedly|quora|pinterest|vkshare|w3c_validator|applebot|google-structured|headless|playwright/i.test(userAgent || "");
}

// Headers arrive as a Fetch Headers object (Next App Router) or as a plain
// lower-cased object (Node, Vercel functions). Read both the same way.
function header(headers, name) {
  if (!headers) return null;
  const v = typeof headers.get === "function" ? headers.get(name) : headers[name];
  return typeof v === "string" && v ? v : null;
}

// First hop of x-forwarded-for is the real client on Vercel; others are proxies.
export function clientIp(headers) {
  const raw = header(headers, "x-vercel-forwarded-for") || header(headers, "x-forwarded-for") || header(headers, "x-real-ip") || "";
  return raw.split(",")[0].trim() || "unknown";
}

// item: { id, title, link }. The link is the page the visitor opened, which
// only the app knows. kind: "view", or "unlock" when a passcode was entered.
export function readVisit(headers, item, kind = "view") {
  let city = header(headers, "x-vercel-ip-city");
  if (city) {
    try { city = decodeURIComponent(city); } catch { /* keep it as sent */ }
  }
  return {
    id: String(item.id),
    title: item.title || "Untitled",
    link: item.link || null,
    kind,
    ip: clientIp(headers),
    city,
    country: header(headers, "x-vercel-ip-country"),
    userAgent: header(headers, "user-agent"),
    referer: header(headers, "referer"),
  };
}

// Fire-and-forget. Resolves true when Notify accepted the view, false otherwise.
export async function notifyShareView(visit) {
  const { NOTIFY_APP: app, NOTIFY_URL: url, NOTIFY_SECRET: secret } = process.env;
  if (!app || !url || !secret) {
    console.warn("[share-alert] NOTIFY_APP, NOTIFY_URL or NOTIFY_SECRET unset, view not reported");
    return false;
  }
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/api/notify`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        app,
        kind: visit.kind,
        item: { id: visit.id, title: visit.title, link: visit.link },
        visitor: { ip: visit.ip, userAgent: visit.userAgent, referer: visit.referer, city: visit.city, country: visit.country },
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) console.error("[share-alert] notify", res.status);
    return res.ok;
  } catch (e) {
    console.error("[share-alert] notify failed", e);
    return false;
  }
}
