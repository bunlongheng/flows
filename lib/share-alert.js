// Who opened a shared flow. Fires once per plain-JSON read of a public share
// link and hands the visit to Notify, the 1 relay every app shares
// (github.com/bunlongheng/notify): it logs the view, numbers it, enriches the
// IP and emails the owner with the Flows icon and name on it.
//
// Never throws and never blocks the response - this runs after() the response
// is already sent, so a failed alert must not surface to the reader.

// Where a share link lives, for the link in the alert.
const APP_URL = (process.env.FLOWS_APP_URL || "https://flows-bheng.vercel.app").replace(/\/$/, "");

// Link-preview crawlers (iMessage, Slack, WhatsApp, Twitter, Facebook) fetch a
// shared URL without a person behind it, and so does a Playwright run.
export function isBot(userAgent) {
  return /bot|crawler|spider|preview|facebookexternalhit|slackbot|twitterbot|whatsapp|telegram|discord|skype|linkedin|embedly|quora|pinterest|vkshare|w3c_validator|applebot|google-structured|headless|playwright/i.test(userAgent || "");
}

// First hop of x-forwarded-for is the real client on Vercel; others are proxies.
export function clientIp(headers) {
  const h = headers || {};
  const raw = h["x-vercel-forwarded-for"] || h["x-forwarded-for"] || h["x-real-ip"] || "";
  return raw.split(",")[0].trim() || "unknown";
}

export function readVisit(req, row) {
  const h = req.headers || {};
  let city = null;
  if (h["x-vercel-ip-city"]) {
    try { city = decodeURIComponent(h["x-vercel-ip-city"]); } catch { city = null; }
  }
  return {
    flowId: row.id,
    title: row.title || "Untitled",
    // The page the visitor opened, not the JSON read behind it.
    link: `${APP_URL}/?${row.slug ? `name=${encodeURIComponent(row.slug)}` : `id=${row.id}`}`,
    kind: "view",
    ip: clientIp(h),
    city,
    country: h["x-vercel-ip-country"] || null,
    userAgent: h["user-agent"] || null,
    referer: h["referer"] || null,
    at: new Date(),
  };
}

// Fire-and-forget. Call without awaiting; it swallows its own failures.
export async function notifyShareView(visit) {
  const url = process.env.NOTIFY_URL;
  const secret = process.env.NOTIFY_SECRET;
  if (!url || !secret) {
    console.warn("[share-alert] NOTIFY_URL or NOTIFY_SECRET unset, view not reported");
    return false;
  }
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/api/notify`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        app: "flows",
        kind: visit.kind,
        item: { id: visit.flowId, title: visit.title, link: visit.link },
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
