import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { isBot, clientIp, readVisit, notifyShareView } = await import("../../lib/share-alert.js");

const ENV_KEYS = ["NOTIFY_URL", "NOTIFY_SECRET"];

describe("share-alert", () => {
  const orig = {};
  beforeEach(() => {
    for (const k of ENV_KEYS) { orig[k] = process.env[k]; delete process.env[k]; }
    globalThis.fetch = vi.fn();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (orig[k] === undefined) delete process.env[k];
      else process.env[k] = orig[k];
    }
    vi.restoreAllMocks();
  });

  it("clientIp prefers x-vercel-forwarded-for, then x-forwarded-for first hop, then x-real-ip, then unknown", () => {
    expect(clientIp({ "x-vercel-forwarded-for": "1.1.1.1", "x-forwarded-for": "2.2.2.2" })).toBe("1.1.1.1");
    expect(clientIp({ "x-forwarded-for": "3.3.3.3, 10.0.0.1" })).toBe("3.3.3.3");
    expect(clientIp({ "x-real-ip": "4.4.4.4" })).toBe("4.4.4.4");
    expect(clientIp({})).toBe("unknown");
  });

  it("isBot flags known crawlers and link-preview bots, not a real browser", () => {
    expect(isBot("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
    expect(isBot("facebookexternalhit/1.1")).toBe(true);
    expect(isBot("Slackbot-LinkExpanding 1.0")).toBe(true);
    expect(isBot("Mozilla/5.0 (Macintosh) HeadlessChrome/120")).toBe(true);
    expect(isBot("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1")).toBe(false);
    expect(isBot(undefined)).toBe(false);
  });

  it("readVisit links the share page by slug, or by id when there is no slug, and reads Vercel geo", () => {
    const req = { headers: { "x-forwarded-for": "73.159.109.147", "x-vercel-ip-city": "Boston", "x-vercel-ip-country": "US", "user-agent": "UA", referer: "https://t.co/x" } };
    const v = readVisit(req, { id: "11111111-1111-1111-1111-111111111111", title: "My flow", slug: "my-flow" });
    expect(v.link).toBe("https://flows-bheng.vercel.app/?name=my-flow");
    expect(v).toMatchObject({ ip: "73.159.109.147", city: "Boston", country: "US", userAgent: "UA", referer: "https://t.co/x", kind: "view", title: "My flow" });
    expect(readVisit(req, { id: "11111111-1111-1111-1111-111111111111", title: "My flow" }).link).toBe("https://flows-bheng.vercel.app/?id=11111111-1111-1111-1111-111111111111");
    expect(readVisit({ headers: {} }, { id: "x" }).title).toBe("Untitled");
  });

  it("notifyShareView posts the visit to Notify as app flows with the bearer secret", async () => {
    process.env.NOTIFY_URL = "https://notify-bheng.vercel.app/";
    process.env.NOTIFY_SECRET = "s3cret";
    globalThis.fetch.mockResolvedValue({ ok: true });
    const visit = readVisit({ headers: { "x-forwarded-for": "73.159.109.147", "user-agent": "UA" } }, { id: "f1", title: "My flow" });
    await expect(notifyShareView(visit)).resolves.toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe("https://notify-bheng.vercel.app/api/notify");
    expect(init.headers.Authorization).toBe("Bearer s3cret");
    expect(JSON.parse(init.body)).toEqual({
      app: "flows", kind: "view",
      item: { id: "f1", title: "My flow", link: "https://flows-bheng.vercel.app/?id=f1" },
      visitor: { ip: "73.159.109.147", userAgent: "UA", referer: null, city: null, country: null },
    });
  });

  it("notifyShareView does nothing without NOTIFY_URL and NOTIFY_SECRET", async () => {
    await expect(notifyShareView(readVisit({ headers: {} }, { id: "f1" }))).resolves.toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("notifyShareView resolves false, never throws, when Notify rejects or the network fails", async () => {
    process.env.NOTIFY_URL = "https://notify-bheng.vercel.app";
    process.env.NOTIFY_SECRET = "s3cret";
    globalThis.fetch.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(notifyShareView(readVisit({ headers: {} }, { id: "f1" }))).resolves.toBe(false);
    globalThis.fetch.mockRejectedValueOnce(new Error("offline"));
    await expect(notifyShareView(readVisit({ headers: {} }, { id: "f1" }))).resolves.toBe(false);
  });
});
