import { test, expect, request } from "@playwright/test";
import { signSession } from "../../lib/auth-session.js";

// A line could be selected and styled but never removed: the canvas dropped
// every edge change that was not a selection, so Delete did nothing at all.
// This checks both halves - the line leaves the canvas AND it leaves the row,
// because a line that comes back on reload was never deleted.
const SECRET = process.env.FLOWS_API_SECRET || "e2e-secret";
const OWNER_COOKIE = `sd_session=${signSession({ email: process.env.OWNER_EMAIL })}`;

test.use({ viewport: { width: 1400, height: 900 } });

const DESIGN = {
  title: "E2E Delete Line",
  type: "flows",
  nodes: [
    { id: "gateway", position: { x: 0, y: 0 } },
    { id: "lambda", position: { x: 420, y: 0 } },
    { id: "s3", position: { x: 840, y: 0 } },
  ],
  edges: [
    { id: "e1", source: "gateway", target: "lambda", label: "invoke" },
    { id: "e2", source: "lambda", target: "s3", label: "store" },
  ],
};

// An SVG path is never "visible" to Playwright, so the line is clicked by
// coordinate - a third of the way along, clear of the draggable step badge.
const clickEdge = async (page, n) => {
  const pt = await page.evaluate((n) => {
    const p = document.querySelectorAll(".react-flow__edge-path")[n];
    const m = p.getPointAtLength(p.getTotalLength() * 0.3);
    const t = p.ownerSVGElement.getScreenCTM();
    return { x: m.x * t.a + m.y * t.c + t.e, y: m.x * t.b + m.y * t.d + t.f };
  }, n);
  await page.mouse.click(pt.x, pt.y);
};

test("Delete removes the selected line, on the canvas and on the server", async ({ page, baseURL }) => {
  const api = await request.newContext({ baseURL });
  const create = await api.post("/api/ai/flows", { headers: { Authorization: `Bearer ${SECRET}` }, data: DESIGN });
  expect(create.status()).toBe(201);
  const id = (await create.json()).url.split("/?id=")[1];
  const storedEdges = async () => {
    const body = await (await api.get(`/api/flows/${id}`, { headers: { Cookie: OWNER_COOKIE } })).json();
    return (body.data?.edges || body.edges || []).map((e) => e.id);
  };

  try {
    await page.context().addCookies([{ name: "sd_session", value: OWNER_COOKIE.split("=")[1], domain: "localhost", path: "/" }]);
    await page.goto(`/?id=${id}`);
    await page.waitForSelector(".react-flow__edge-path", { state: "attached" });
    await page.waitForTimeout(1500);
    expect(await page.locator(".react-flow__edge-path").count()).toBe(2);

    await clickEdge(page, 0);
    await page.waitForSelector(".sd-format-panel");
    await page.keyboard.press("Delete");
    await page.waitForTimeout(1200);

    // 1 line gone from the canvas, and the OTHER one is still there.
    expect(await page.locator(".react-flow__edge-path").count()).toBe(1);
    expect(await storedEdges()).toEqual(["e2"]);

    // It stays gone.
    await page.reload();
    await page.waitForSelector(".react-flow__node");
    await page.waitForTimeout(1500);
    expect(await page.locator(".react-flow__edge-path").count()).toBe(1);
  } finally {
    await api.delete(`/api/flows/${id}`, { headers: { Cookie: OWNER_COOKIE } });
    await api.delete(`/api/flows/${id}?purge=1`, { headers: { Cookie: OWNER_COOKIE } });
    await api.dispose();
  }
});
