// @vitest-environment node
// Identical in every app: it tests the contract with Notify, nothing app-specific.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isBot, clientIp, readVisit, notifyShareView } from "../../lib/share-alert.js";

const ENV_KEYS = ["NOTIFY_APP", "NOTIFY_URL", "NOTIFY_SECRET"];
const LINK = "https://example.test/?id=f1";

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

  it("isBot flags crawlers, link previews and headless runs, not a real browser", () => {
    expect(isBot("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
    expect(isBot("facebookexternalhit/1.1")).toBe(true);
    expect(isBot("Slackbot-LinkExpanding 1.0")).toBe(true);
    expect(isBot("Mozilla/5.0 (Macintosh) HeadlessChrome/120")).toBe(true);
    expect(isBot("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1")).toBe(false);
    expect(isBot(null)).toBe(false);
    expect(isBot(undefined)).toBe(false);
  });

  it("clientIp reads a plain header object or a Headers instance, first hop wins, unknown otherwise", () => {
    expect(clientIp({ "x-vercel-forwarded-for": "1.1.1.1", "x-forwarded-for": "2.2.2.2" })).toBe("1.1.1.1");
    expect(clientIp({ "x-forwarded-for": "3.3.3.3, 10.0.0.1" })).toBe("3.3.3.3");
    expect(clientIp({ "x-real-ip": "4.4.4.4" })).toBe("4.4.4.4");
    expect(clientIp(new Headers({ "x-forwarded-for": "5.5.5.5, 10.0.0.2" }))).toBe("5.5.5.5");
    expect(clientIp({})).toBe("unknown");
    expect(clientIp(undefined)).toBe("unknown");
  });

  it("readVisit keeps the caller's link, decodes Vercel geo, defaults title and kind", () => {
    const h = { "x-forwarded-for": "73.159.109.147", "x-vercel-ip-city": "S%C3%A3o%20Paulo", "x-vercel-ip-country": "BR", "user-agent": "UA", referer: "https://t.co/x" };
    expect(readVisit(h, { id: 7, title: "My item", link: LINK })).toEqual({
      id: "7", title: "My item", link: LINK, kind: "view", ip: "73.159.109.147",
      city: "São Paulo", country: "BR", userAgent: "UA", referer: "https://t.co/x",
    });
    const bare = readVisit(new Headers(), { id: "x" }, "unlock");
    expect(bare).toMatchObject({ id: "x", title: "Untitled", link: null, kind: "unlock", ip: "unknown", city: null, country: null, userAgent: null, referer: null });
  });

  it("notifyShareView posts the visit to Notify as NOTIFY_APP with the bearer secret", async () => {
    process.env.NOTIFY_APP = "flows";
    process.env.NOTIFY_URL = "https://notify-bheng.vercel.app/";
    process.env.NOTIFY_SECRET = "s3cret";
    globalThis.fetch.mockResolvedValue({ ok: true });
    const visit = readVisit({ "x-forwarded-for": "73.159.109.147", "user-agent": "UA" }, { id: "f1", title: "My item", link: LINK });
    await expect(notifyShareView(visit)).resolves.toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe("https://notify-bheng.vercel.app/api/notify");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer s3cret");
    expect(JSON.parse(init.body)).toEqual({
      app: "flows", kind: "view",
      item: { id: "f1", title: "My item", link: LINK },
      visitor: { ip: "73.159.109.147", userAgent: "UA", referer: null, city: null, country: null },
    });
  });

  it("notifyShareView does nothing when any of the 3 env vars is missing", async () => {
    process.env.NOTIFY_URL = "https://notify-bheng.vercel.app";
    process.env.NOTIFY_SECRET = "s3cret";
    await expect(notifyShareView(readVisit({}, { id: "f1" }))).resolves.toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("notifyShareView resolves false and never throws when Notify rejects or the network fails", async () => {
    process.env.NOTIFY_APP = "flows";
    process.env.NOTIFY_URL = "https://notify-bheng.vercel.app";
    process.env.NOTIFY_SECRET = "s3cret";
    globalThis.fetch.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(notifyShareView(readVisit({}, { id: "f1" }))).resolves.toBe(false);
    globalThis.fetch.mockRejectedValueOnce(new Error("offline"));
    await expect(notifyShareView(readVisit({}, { id: "f1" }))).resolves.toBe(false);
  });
});
