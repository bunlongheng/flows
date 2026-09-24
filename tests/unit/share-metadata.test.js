import { describe, it, expect, beforeEach, vi } from "vitest";

const query = vi.fn();
vi.mock("../../lib/db.js", () => ({ default: { query: (...a) => query(...a) } }));
const { designMetadata, describe: describeRow } = await import("../../app/share-metadata.js");

const ROW = { title: "AppMarket Billing", slug: "appmarket-billing", description: "d", pattern: "Tray chain" };
const ID = "a69c82fc-0626-4032-bb83-69ac341670ee";

describe("designMetadata (share card)", () => {
  beforeEach(() => query.mockReset());

  // The link the API and MCP return is /?id=<uuid>. It used to preview as the
  // generic site card in Slack even when the design was public.
  it("builds the design's own card for a public ?id= link", async () => {
    query.mockResolvedValueOnce({ rows: [ROW] });
    const m = await designMetadata({ id: ID }, "/");
    expect(query.mock.calls[0][0]).toContain("id = $1::uuid");
    expect(query.mock.calls[0][1]).toEqual([ID]);
    expect(m.openGraph.title).toBe("AppMarket Billing");
    expect(m.openGraph.siteName).toBe("Flows");
    expect(m.openGraph.images[0].url).toBe("/api/og?name=appmarket-billing");
    expect(m.openGraph.images[0].alt).toContain("AppMarket Billing");
    expect(m.twitter.images[0].url).toBe("/api/og?name=appmarket-billing");
  });

  // Crawlers cache the image by URL for days; an edited diagram kept previewing
  // as it was when the link was first pasted.
  it("stamps the last edit onto the image URL so an edited diagram previews fresh", async () => {
    query.mockResolvedValueOnce({ rows: [{ ...ROW, v: 1790276374 }] });
    const m = await designMetadata({ id: ID }, "/");
    expect(m.openGraph.images[0].url).toBe("/api/og?name=appmarket-billing&v=1790276374");
    expect(m.twitter.images[0].url).toBe("/api/og?name=appmarket-billing&v=1790276374");
  });

  it("describes an undescribed design by its own nodes, not a stock sentence", () => {
    const nodes = ["User", "API Gateway", "Lambda", "DynamoDB", "SQS", "S3"].map((label) => ({ label }));
    expect(describeRow({ nodes })).toBe("User, API Gateway, Lambda, DynamoDB and 2 more - an interactive architecture diagram on Flows.");
    expect(describeRow({ nodes: nodes.slice(0, 2) })).toBe("User, API Gateway - an interactive architecture diagram on Flows.");
    expect(describeRow({ pattern: "Fan-out", nodes })).toBe("Fan-out");
    expect(describeRow({ description: "d", nodes })).toBe("d");
    expect(describeRow({})).toBe("An interactive architecture diagram on Flows.");
  });

  it("still resolves ?name= by slug and prefers it over ?id=", async () => {
    query.mockResolvedValueOnce({ rows: [ROW] });
    await designMetadata({ name: "appmarket-billing", id: ID }, "/demo");
    expect(query.mock.calls[0][0]).toContain("slug = $1");
    expect(query.mock.calls[0][1]).toEqual(["appmarket-billing"]);
  });

  it("ignores a malformed id and never queries", async () => {
    expect(await designMetadata({ id: "not-a-uuid" }, "/")).toEqual({});
    expect(await designMetadata({}, "/")).toEqual({});
    expect(query).not.toHaveBeenCalled();
  });

  it("gives a private or unknown design the generic card (empty metadata)", async () => {
    query.mockResolvedValueOnce({ rows: [] });
    expect(await designMetadata({ id: ID }, "/")).toEqual({});
  });
});
