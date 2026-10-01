import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const query = vi.fn();
vi.mock("../../lib/db.js", () => ({ default: { query: (...a) => query(...a) } }));

const { isBot, clientIp, lookupIp, alertBody, readVisit, notifyShareView } = await import("../../lib/share-alert.js");

const ENV_KEYS = ["RESEND_API_KEY", "OWNER_EMAIL", "STICKIES_API_KEY", "STICKIES_TOKEN", "IPINFO_TOKEN", "SHARE_ALERT_FROM"];

describe("share-alert", () => {
  const orig = {};
  beforeEach(() => {
    for (const k of ENV_KEYS) { orig[k] = process.env[k]; delete process.env[k]; }
    query.mockReset();
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (orig[k] === undefined) delete process.env[k];
      else process.env[k] = orig[k];
    }
    vi.restoreAllMocks();
  });

  it("clientIp prefers x-vercel-forwarded-for, then x-forwarded-for first hop, then x-real-ip, then unknown", () => {
    expect(clientIp({ "x-vercel-forwarded-for": "1.1.1.1", "x-forwarded-for": "2.2.2.2", "x-real-ip": "3.3.3.3" })).toBe("1.1.1.1");
    expect(clientIp({ "x-forwarded-for": "4.4.4.4, 5.5.5.5", "x-real-ip": "3.3.3.3" })).toBe("4.4.4.4");
    expect(clientIp({ "x-real-ip": "3.3.3.3" })).toBe("3.3.3.3");
    expect(clientIp({})).toBe("unknown");
  });

  it("isBot flags known crawlers and link-preview bots, not a real browser", () => {
    expect(isBot("Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)")).toBe(true);
    expect(isBot("facebookexternalhit/1.1")).toBe(true);
    expect(isBot("WhatsApp/2.23")).toBe(true);
    expect(isBot("Twitterbot/1.0")).toBe(true);
    expect(isBot("Mozilla/5.0 (compatible; Applebot/0.1)")).toBe(true);
    expect(isBot("Playwright/1.62.1 (arm64; macOS 26.2) node/22.23")).toBe(true);
    expect(isBot("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15")).toBe(false);
  });

  it("alertBody renders the map, view count, escaped title and ipinfo link", () => {
    const visit = {
      title: "<b>My flow</b>",
      link: "https://flows-bheng.vercel.app/?name=my-flow",
      ip: "73.159.109.147",
      city: "Springfield",
      country: "US",
      userAgent: "test-agent",
      referer: null,
      kind: "view",
      at: new Date("2026-10-01T12:00:00Z"),
      geo: { loc: "42.1,-72.6", hostname: null, city: "Springfield", region: null, country: "US", org: null, postal: null, timezone: null },
    };
    const html = alertBody(visit, 3);
    expect(html).toContain("view <b>3</b>");
    expect(html).toContain("https://static-maps.yandex.ru/1.x/?lang=en_US&ll=-72.6,42.1");
    expect(html).toContain("&lt;b&gt;My flow&lt;/b&gt;");
    expect(html).toContain("ipinfo.io/");
    expect(html).toContain('href="https://flows-bheng.vercel.app/?name=my-flow"');
    expect(html).toContain("/icon-96.png");
  });

  it("readVisit links the share page by slug, or by id when there is no slug", () => {
    const req = { headers: { "x-forwarded-for": "73.159.109.147", "user-agent": "ua" } };
    expect(readVisit(req, { id: "11111111-1111-1111-1111-111111111111", title: "My flow", slug: "my-flow" }).link).toBe("https://flows-bheng.vercel.app/?name=my-flow");
    expect(readVisit(req, { id: "11111111-1111-1111-1111-111111111111", title: "My flow" }).link).toBe("https://flows-bheng.vercel.app/?id=11111111-1111-1111-1111-111111111111");
  });

  it("lookupIp returns null for private/loopback/unknown without calling fetch, and null when fetch rejects", async () => {
    expect(await lookupIp("127.0.0.1")).toBeNull();
    expect(await lookupIp("10.0.0.5")).toBeNull();
    expect(await lookupIp("unknown")).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    globalThis.fetch.mockRejectedValueOnce(new Error("network down"));
    expect(await lookupIp("73.159.109.147")).toBeNull();
  });

  it("notifyShareView emails via Resend and posts the Stickies note when both are configured, and marks the row emailed", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.OWNER_EMAIL = "owner@example.com";
    process.env.STICKIES_TOKEN = "stickies-token";
    query.mockResolvedValueOnce({ rows: [{ id: "log-1" }] });
    query.mockResolvedValueOnce({ rows: [{ n: 2 }] });
    query.mockResolvedValueOnce({ rows: [] });
    globalThis.fetch.mockImplementation((url) => {
      if (String(url).includes("ipinfo.io")) {
        return Promise.resolve({ ok: true, json: async () => ({ city: "Springfield" }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ id: "re_1" }) });
    });

    await notifyShareView({
      flowId: "11111111-1111-1111-1111-111111111111",
      title: "My flow",
      kind: "view",
      ip: "73.159.109.147",
      city: null,
      country: null,
      userAgent: "test-agent",
      referer: null,
      at: new Date(),
    });

    const resendCalls = globalThis.fetch.mock.calls.filter((c) => c[0] === "https://api.resend.com/emails");
    expect(resendCalls).toHaveLength(1);
    const body = JSON.parse(resendCalls[0][1].body);
    expect(body.to).toEqual(["owner@example.com"]);
    expect(body.subject).toBe("Opened: My flow - 73.159.109.147");

    const emailedCall = query.mock.calls.find((c) => /SET emailed = true/.test(c[0]));
    expect(emailedCall[1]).toEqual(["log-1"]);
    const stickiesCalls = globalThis.fetch.mock.calls.filter((c) => String(c[0]).includes("stickies"));
    expect(stickiesCalls).toHaveLength(1);
  });

  it("notifyShareView still posts to Stickies when there is no RESEND_API_KEY", async () => {
    process.env.STICKIES_TOKEN = "stickies-token";
    query.mockResolvedValueOnce({ rows: [{ id: "log-2" }] });
    query.mockResolvedValueOnce({ rows: [{ n: 1 }] });
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });

    await notifyShareView({
      flowId: "11111111-1111-1111-1111-111111111111",
      title: "Opened: Opened: My flow",
      kind: "view",
      ip: "73.159.109.147",
      city: null,
      country: null,
      userAgent: "test-agent",
      referer: null,
      at: new Date(),
    });

    const stickiesCalls = globalThis.fetch.mock.calls.filter((c) => String(c[0]) === "http://localhost:4444/api/stickies/ext");
    expect(stickiesCalls).toHaveLength(1);
    const body = JSON.parse(stickiesCalls[0][1].body);
    expect(body.type).toBe("html");
    expect(body.folder).toBe("Alerts");
    expect(body.icon).toBe("__hero:EyeIcon");
    expect(body.title).toBe("Opened: My flow");
    const resendCalls = globalThis.fetch.mock.calls.filter((c) => c[0] === "https://api.resend.com/emails");
    expect(resendCalls).toHaveLength(0);
  });

  it("notifyShareView resolves without throwing when the db insert rejects, and never calls Resend or Stickies", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.OWNER_EMAIL = "owner@example.com";
    process.env.STICKIES_TOKEN = "stickies-token";
    query.mockRejectedValueOnce(new Error("db down"));

    await expect(notifyShareView({
      flowId: "11111111-1111-1111-1111-111111111111",
      title: "My flow",
      kind: "view",
      ip: "73.159.109.147",
      city: null,
      country: null,
      userAgent: "test-agent",
      referer: null,
      at: new Date(),
    })).resolves.toBeUndefined();

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
