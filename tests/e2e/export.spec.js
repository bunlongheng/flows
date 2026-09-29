import { test, expect, request } from "@playwright/test";
import { signSession } from "../../lib/auth-session.js";

// The interchange exports, over the real route: a flow has to come back as a
// file another tool can open, with its logos in it, and a PRIVATE flow must not
// come back at all.
const SECRET = process.env.FLOWS_API_SECRET || "e2e-secret";
const OWNER_COOKIE = `sd_session=${signSession({ email: process.env.OWNER_EMAIL })}`;

const DESIGN = {
  title: "E2E Export",
  type: "flows",
  nodes: [
    { id: "apigw", position: { x: 40, y: 200 } },
    { id: "lambda", position: { x: 300, y: 200 } },
    { id: "dynamo", position: { x: 560, y: 200 } },
  ],
  edges: [
    { id: "e1", source: "apigw", target: "lambda", label: "invoke" },
    { id: "e2", source: "lambda", target: "dynamo", label: "put" },
  ],
};

async function withDesign(baseURL, { publish }, body) {
  const api = await request.newContext({ baseURL });
  const create = await api.post("/api/ai/flows", {
    headers: { Authorization: `Bearer ${SECRET}` },
    data: DESIGN,
  });
  expect(create.status()).toBe(201);
  const id = (await create.json()).url.split("/?id=")[1];
  try {
    if (publish) {
      await api.patch(`/api/flows/${id}`, {
        headers: { Cookie: OWNER_COOKIE, "Content-Type": "application/json" },
        data: { is_public: true },
      });
    }
    await body(api, id);
  } finally {
    await api.delete(`/api/flows/${id}`, { headers: { Cookie: OWNER_COOKIE } });
    await api.delete(`/api/flows/${id}?purge=1`, { headers: { Cookie: OWNER_COOKIE } });
    await api.dispose();
  }
}

test("?format=excalidraw returns an openable scene with the logos embedded", async ({ baseURL }) => {
  await withDesign(baseURL, { publish: true }, async (api, id) => {
    const res = await api.get(`/api/flows/${id}?format=excalidraw`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/json");
    // It downloads as a file rather than rendering in the tab.
    expect(res.headers()["content-disposition"]).toMatch(/attachment; filename=".*\.excalidraw"/);

    const scene = JSON.parse(await res.text());
    expect(scene.type).toBe("excalidraw");

    // Real shapes and real bound arrows - not a picture.
    const ids = new Set(scene.elements.map((e) => e.id));
    const arrows = scene.elements.filter((e) => e.type === "arrow");
    expect(arrows).toHaveLength(2);
    expect(arrows.every((a) => ids.has(a.startBinding.elementId) && ids.has(a.endBinding.elementId))).toBe(true);

    // And the point of the whole thing: every card carries its real logo.
    const images = scene.elements.filter((e) => e.type === "image");
    expect(images).toHaveLength(3);
    expect(images.every((i) => scene.files[i.fileId])).toBe(true);
    expect(Object.values(scene.files).every((f) => f.dataURL.startsWith("data:image/"))).toBe(true);
  });
});

test("a private flow's export is a 404 to a stranger, same as its svg", async ({ baseURL }) => {
  await withDesign(baseURL, { publish: false }, async (api, id) => {
    const anon = await request.newContext({ baseURL });
    expect((await anon.get(`/api/flows/${id}?format=excalidraw`)).status()).toBe(404);
    // The owner still gets it.
    const mine = await api.get(`/api/flows/${id}?format=excalidraw`, { headers: { Cookie: OWNER_COOKIE } });
    expect(mine.status()).toBe(200);
    await anon.dispose();
  });
});

test("?format=drawio returns XML Lucid and draw.io both import", async ({ baseURL }) => {
  await withDesign(baseURL, { publish: true }, async (api, id) => {
    const res = await api.get(`/api/flows/${id}?format=drawio`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-disposition"]).toMatch(/attachment; filename=".*\.drawio"/);

    const xml = await res.text();
    expect(xml.startsWith("<mxfile")).toBe(true);
    // One vertex per node, one edge per edge, both wired to ids that exist.
    const cells = xml.match(/<mxCell [^>]*>/g) || [];
    expect(cells.filter((c) => c.includes('vertex="1"'))).toHaveLength(3);
    expect(cells.filter((c) => c.includes('edge="1"'))).toHaveLength(2);

    // The logos, in the one form draw.io's semicolon-delimited style survives.
    expect(xml.match(/image=data:image\/svg\+xml,/g)).toHaveLength(3);
    expect(xml).not.toContain(";base64,");
  });
});

test("the Miro push is owner-only and checks the board URL before it calls Miro", async ({ baseURL }) => {
  await withDesign(baseURL, { publish: true }, async (api, id) => {
    // Public flow, but a push writes to someone's board - a stranger cannot.
    const anon = await request.newContext({ baseURL });
    const out = await anon.post(`/api/flows/${id}/miro`, { data: { token: "t", board: "https://miro.com/app/board/abc123=/" } });
    expect(out.status()).toBe(401);
    await anon.dispose();

    // The owner gets as far as validation, which rejects a non-board URL
    // without ever putting the token on the wire.
    const bad = await api.post(`/api/flows/${id}/miro`, {
      headers: { Cookie: OWNER_COOKIE },
      data: { token: "t", board: "https://example.com/not-a-board" },
    });
    expect(bad.status()).toBe(400);
  });
});
