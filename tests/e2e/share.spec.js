import { test, expect, request } from "@playwright/test";
import { signSession } from "../../lib/auth-session.js";

// The share path a crawler walks: GET the design's URL, read the head, then GET
// the og:image it points at.
//
// The spec creates and publishes its OWN design rather than leaning on the demo
// roster - CI runs against an empty database with only migrations applied, so
// any seeded row is a local-only assumption.
const SECRET = process.env.FLOWS_API_SECRET || "e2e-secret";
const OWNER_COOKIE = `sd_session=${signSession({ email: process.env.OWNER_EMAIL })}`;

// Next emits `content="x"/>` where the hand-built HTML emitted `content="x" />`.
// Assert on the VALUE rather than the framework's whitespace, so this spec is
// about the card being right, not about who rendered it.
const meta = (html, key) => {
  const m = new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`).exec(html);
  return m ? m[1] : null;
};
const titleTag = (html) => (/<title>([^<]*)<\/title>/.exec(html) || [])[1] || null;

const DESIGN = {
  title: "E2E Share Card",
  type: "flows",
  nodes: [
    { id: "user", position: { x: 40, y: 200 } },
    { id: "apigw", position: { x: 260, y: 200 } },
    { id: "ses", position: { x: 480, y: 200 } },
    { id: "redis", position: { x: 700, y: 200 } },
  ],
  edges: [
    { id: "e1", source: "user", target: "apigw", label: "send" },
    { id: "e2", source: "apigw", target: "ses", label: "deliver" },
    { id: "e3", source: "ses", target: "redis", label: "suppress" },
  ],
};

// Delete is soft now, so a spec that only DELETEs leaves a row in trash on every
// run. Purge afterwards so the suite cleans up after itself.
async function purge(api, id) {
  await api.delete(`/api/flows/${id}`, { headers: { Cookie: OWNER_COOKIE } });
  await api.delete(`/api/flows/${id}?purge=1`, { headers: { Cookie: OWNER_COOKIE } });
}

// Creates the design, publishes it, hands (api, id, slug) to the body, cleans up.
async function withPublicDesign(baseURL, body) {
  const api = await request.newContext({ baseURL });
  const create = await api.post("/api/ai/flows", {
    headers: { Authorization: `Bearer ${SECRET}` },
    data: DESIGN,
  });
  expect(create.status()).toBe(201);
  const id = (await create.json()).url.split("/?id=")[1];
  try {
    await api.patch(`/api/flows/${id}`, {
      headers: { Cookie: OWNER_COOKIE, "Content-Type": "application/json" },
      data: { is_public: true },
    });
    const row = await (await api.get(`/api/flows/${id}`)).json();
    expect(row.slug).toBeTruthy();
    await body(api, id, row.slug);
  } finally {
    await purge(api, id);
    await api.dispose();
  }
}

test("a shared design URL serves its OWN og tags, not the generic site card", async ({ baseURL }) => {
  await withPublicDesign(baseURL, async (api, _id, slug) => {
    const res = await api.get(`/demo?name=${slug}`);
    expect(res.status()).toBe(200);
    const html = await res.text();

    // Title comes from the design row, not the static shell.
    expect(meta(html, "og:title")).toBe(DESIGN.title);
    expect(meta(html, "og:type")).toBe("article");
    expect(titleTag(html)).toBe(`${DESIGN.title} · Flows`);

    // The card points at the per-design renderer, and the canonical url keeps ?name=.
    expect(html).toMatch(new RegExp(`og:image" content="[^"]*/api/og\\?name=${slug}"`));
    expect(html).toMatch(new RegExp(`og:url" content="[^"]*/demo\\?name=${slug}"`));

    // And it is still the real app shell - a human gets the app, not a stub.
    // (Vite's <div id="root"> and /assets/ bundle are gone; Next ships its own.)
    expect(html).toMatch(/<script[^>]*src="\/_next\/static\/chunks\//);
  });
});

test("/api/og renders a real 1200x630 PNG for a public design", async ({ baseURL }) => {
  await withPublicDesign(baseURL, async (api, _id, slug) => {
    const res = await api.get(`/api/og?name=${slug}`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/png");

    const buf = await res.body();
    expect(buf.length).toBeGreaterThan(5000);
    // PNG magic, then width/height straight out of the IHDR chunk.
    expect(buf.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(buf.readUInt32BE(16)).toBe(1200);
    expect(buf.readUInt32BE(20)).toBe(630);
  });
});

test("a PRIVATE design gets no card and no title - an unlisted link stays unlisted", async ({ baseURL }) => {
  const api = await request.newContext({ baseURL, maxRedirects: 0 });
  const create = await api.post("/api/ai/flows", {
    headers: { Authorization: `Bearer ${SECRET}` },
    data: { ...DESIGN, title: "E2E Private Card" },
  });
  const id = (await create.json()).url.split("/?id=")[1];
  try {
    // Created private by default - never published.
    const row = await (await api.get(`/api/flows/${id}`, { headers: { Cookie: OWNER_COOKIE } })).json();
    const html = await (await api.get(`/?name=${row.slug}`)).text();
    expect(html).not.toContain("E2E Private Card");
    expect(meta(html, "og:title")).toBe("Flows");

    const og = await api.get(`/api/og?name=${row.slug}`);
    expect(og.status()).toBe(302);
    expect(og.headers()["location"]).toBe("/og.png");
  } finally {
    await purge(api, id);
    await api.dispose();
  }
});

test("the gallery itself keeps the generic card", async ({ baseURL }) => {
  const api = await request.newContext({ baseURL });
  try {
    const html = await (await api.get("/demo")).text();
    expect(meta(html, "og:title")).toBe("Flows");
  } finally {
    await api.dispose();
  }
});

test("/api/og falls back to the static card for an unknown slug", async ({ baseURL }) => {
  const api = await request.newContext({ baseURL, maxRedirects: 0 });
  try {
    const res = await api.get("/api/og?name=no-such-design-exists");
    expect(res.status()).toBe(302);
    expect(res.headers()["location"]).toBe("/og.png");
  } finally {
    await api.dispose();
  }
});

// Delete is a SOFT delete: the row leaves every read path but is kept, so a
// cleanup that removes the wrong diagram is always recoverable.
test("DELETE moves a design to trash instead of destroying it", async ({ baseURL }) => {
  const api = await request.newContext({ baseURL });
  const create = await api.post("/api/ai/flows", {
    headers: { Authorization: `Bearer ${SECRET}` },
    data: { ...DESIGN, title: "E2E Trash Round Trip" },
  });
  const id = (await create.json()).url.split("/?id=")[1];

  // Public, so its disappearance is observable without auth.
  await api.patch(`/api/flows/${id}`, {
    headers: { Cookie: OWNER_COOKIE, "Content-Type": "application/json" },
    data: { is_public: true },
  });
  expect((await api.get(`/api/flows/${id}`)).status()).toBe(200);

  const del = await api.delete(`/api/flows/${id}`, { headers: { Cookie: OWNER_COOKIE } });
  expect(del.status()).toBe(200);
  expect((await del.json()).deleted).toBe(true);

  // Gone from every read path...
  expect((await api.get(`/api/flows/${id}`)).status()).toBe(404);
  const og = await (await request.newContext({ baseURL, maxRedirects: 0 })).get(`/api/og?id=${id}`);
  expect(og.status()).toBe(302);

  // ...and deleting it again is a no-op, not a second destruction.
  expect((await (await api.delete(`/api/flows/${id}`, { headers: { Cookie: OWNER_COOKIE } })).json()).deleted).toBe(false);

  // ...until it is purged, which only works on something already trashed.
  expect((await (await api.delete(`/api/flows/${id}?purge=1`, { headers: { Cookie: OWNER_COOKIE } })).json()).purged).toBe(true);
  expect((await (await api.delete(`/api/flows/${id}?purge=1`, { headers: { Cookie: OWNER_COOKIE } })).json()).purged).toBe(false);
  await api.dispose();
});
