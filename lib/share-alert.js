// Who opened a shared flow. Fires once per plain-JSON read of a public share
// link: every view is written to flow_view_log (so nothing is lost before an
// email provider is configured) and emailed to OWNER_EMAIL when RESEND_API_KEY
// is set, else dropped into the owner's own Stickies board.
//
// Never throws and never blocks the response - this runs after() the response
// is already sent, so a failed alert must not surface to the reader.
import db from "./db.js";

// Where a share link lives, for the link in the alert and the app icon on it.
const APP_URL = (process.env.FLOWS_APP_URL || "https://flows-bheng.vercel.app").replace(/\/$/, "");

// Link-preview crawlers (iMessage, Slack, WhatsApp, Twitter, Facebook) fetch a
// shared URL without a person behind it, and so does a Playwright run.
export function isBot(userAgent) {
  return /bot|crawler|spider|preview|facebookexternalhit|slackbot|twitterbot|whatsapp|telegram|discord|skype|linkedin|embedly|quora|pinterest|vkshare|w3c_validator|applebot|google-structured|headless|playwright/i.test(userAgent || "");
}

const PRIVATE_IP = /^(unknown|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd|fe80)/i;

// First hop of x-forwarded-for is the real client on Vercel; others are proxies.
export function clientIp(headers) {
  const h = headers || {};
  const raw = h["x-vercel-forwarded-for"] || h["x-forwarded-for"] || h["x-real-ip"] || "";
  return raw.split(",")[0].trim() || "unknown";
}

// Enrich a public IP via ipinfo.io (keyless; IPINFO_TOKEN lifts the rate
// limit). 3 s cap, null on any failure.
export async function lookupIp(ip) {
  if (PRIVATE_IP.test(ip)) return null;
  try {
    const token = process.env.IPINFO_TOKEN ? `?token=${process.env.IPINFO_TOKEN}` : "";
    const res = await fetch(`https://ipinfo.io/${encodeURIComponent(ip)}/json${token}`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const j = await res.json();
    const pick = (k) => (typeof j[k] === "string" && j[k] ? j[k] : null);
    return { hostname: pick("hostname"), city: pick("city"), region: pick("region"), country: pick("country"),
      loc: pick("loc"), org: pick("org"), postal: pick("postal"), timezone: pick("timezone") };
  } catch { return null; }
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

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

export function alertBody(visit, viewNumber) {
  const g = visit.geo;
  const city = g?.city || visit.city;
  const country = g?.country || visit.country;
  const when = visit.at.toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }) + " ET";
  const [lat, lon] = (g?.loc || "").split(",");
  const mapUrl = lat && lon
    ? `https://static-maps.yandex.ru/1.x/?lang=en_US&ll=${lon},${lat}&z=9&size=600,300&l=map&pt=${lon},${lat},pm2rdm`
    : null;
  const eyebrow = visit.kind === "unlock" ? "Flows share - passcode unlock" : "Flows share - link opened";
  const verb = visit.kind === "unlock" ? "entered the passcode" : "opened the shared link";
  const row = (k, val) =>
    `<tr><td style="padding:7px 16px 7px 0;color:#71717a;font-size:13px;white-space:nowrap;vertical-align:top">${k}</td>` +
    `<td style="padding:7px 0;color:#18181b;font-size:14px;font-weight:600;word-break:break-word">${val ? escapeHtml(val) : "<span style=\"color:#a1a1aa;font-weight:400\">unknown</span>"}</td></tr>`;
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto;padding:8px 0 24px;color:#18181b">
  <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#a1a1aa;font-weight:700;margin-bottom:6px"><img src="${APP_URL}/icon-96.png" alt="Flows" width="18" height="18" style="display:inline-block;vertical-align:middle;border-radius:4px;margin:0 6px 2px 0">${eyebrow}</div>
  <h1 style="font-size:20px;line-height:1.35;margin:0 0 14px;color:#18181b">Someone opened "${visit.link ? `<a href="${escapeHtml(visit.link)}" style="color:#18181b">${escapeHtml(visit.title)}</a>` : escapeHtml(visit.title)}"</h1>
  <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#3f3f46">Someone from <b>${escapeHtml(visit.ip)}</b> ${verb} on <b>${when}</b>${country ? ` from <b style="color:#ef4444">${escapeHtml(country)}</b>` : ""}. This is view <b>${viewNumber}</b> of this flow.</p>
  <table style="border-collapse:collapse;width:100%;max-width:100%;border-top:1px solid #e4e4e7;border-bottom:1px solid #e4e4e7;margin:0 0 18px">
    ${visit.link ? `<tr><td style="padding:7px 16px 7px 0;color:#71717a;font-size:13px;white-space:nowrap;vertical-align:top">Link</td><td style="padding:7px 0;font-size:14px;font-weight:600;word-break:break-all"><a href="${escapeHtml(visit.link)}" style="color:#2563eb">${escapeHtml(visit.link)}</a></td></tr>` : ""}
    ${row("Target IP", visit.ip)}
    ${row("Hostname", g?.hostname ?? null)}
    ${row("City", city)}
    ${row("Region", g?.region ?? null)}
    ${row("Country", country)}
    ${row("Coordinates", g?.loc ?? null)}
    ${row("Org", g?.org ?? null)}
    ${row("Postal", g?.postal ?? null)}
    ${row("Timezone", g?.timezone ?? null)}
    ${row("Referrer", visit.referer || "direct")}
  </table>
  ${mapUrl ? `<img src="${mapUrl}" alt="Map near ${escapeHtml(city || visit.ip)}" width="600" height="300" style="display:block;max-width:100%;height:auto;border-radius:10px;border:1px solid #e4e4e7;margin:0 0 18px">` : ""}
  <p style="margin:0 0 6px;font-size:14px;color:#3f3f46">More detail: <a href="https://ipinfo.io/${encodeURIComponent(visit.ip)}" style="color:#2563eb">ipinfo.io/${escapeHtml(visit.ip)}</a></p>
  <p style="margin:0;color:#a1a1aa;font-size:12px;word-break:break-all">${escapeHtml(visit.userAgent || "no user agent")}</p>
</div>`;
}

async function sendEmail(visit, viewNumber) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.OWNER_EMAIL;
  if (!key || !to) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.SHARE_ALERT_FROM || "Flows <onboarding@resend.dev>",
      to: [to],
      subject: `Opened: ${visit.title} - ${visit.ip}`,
      html: alertBody(visit, viewNumber),
    }),
  });
  return res.ok;
}

// No email provider configured yet (or Resend failed): drop the alert into the
// owner's own Stickies board instead, so a visit is never silent.
async function postStickyNote(visit, viewNumber) {
  const token = process.env.STICKIES_API_KEY || process.env.STICKIES_TOKEN;
  if (!token) return;
  await fetch(`${process.env.STICKIES_URL || "http://localhost:4444"}/api/stickies/ext`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "html",
      title: `Opened: ${visit.title.replace(/^(Opened:\s*)+/, "")}`,
      content: alertBody(visit, viewNumber),
      folder: "Alerts",
      icon: "__hero:EyeIcon",
    }),
  });
}

// Fire-and-forget. Call without awaiting; it swallows its own failures.
export async function notifyShareView(visit) {
  try {
    const inserted = await db.query(
      `INSERT INTO flow_view_log (flow_id, title, kind, ip, city, country, user_agent, referer)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [visit.flowId, visit.title, visit.kind, visit.ip, visit.city, visit.country, visit.userAgent, visit.referer],
    );
    const id = inserted.rows[0]?.id;
    const counted = await db.query(`SELECT COUNT(*)::int AS n FROM flow_view_log WHERE flow_id = $1`, [visit.flowId]);
    const viewNumber = counted.rows[0]?.n || 1;
    visit.geo = await lookupIp(visit.ip);
    if (await sendEmail(visit, viewNumber)) {
      await db.query(`UPDATE flow_view_log SET emailed = true WHERE id = $1`, [id]);
      return;
    }
    await postStickyNote(visit, viewNumber);
  } catch (e) {
    console.error("[share-alert] failed", e);
  }
}
