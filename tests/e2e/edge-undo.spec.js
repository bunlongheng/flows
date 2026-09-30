import { test, expect, request } from "@playwright/test";
import { signSession } from "../../lib/auth-session.js";

// Bending a line was the one canvas edit with no way back. A snapshot was node
// positions and nothing else, so Cmd+Z could walk back a drag or an Arrange but
// not a bend, a dragged endpoint or a slid badge - and every one of those PATCHes
// itself straight to the server, so it survived a reload too.
//
// Snapshots now carry the edge pins alongside the positions. The PATCH deletes
// any pin it is not sent, so an undone bend is undone on the server as well.
const SECRET = process.env.FLOWS_API_SECRET || "e2e-secret";
const OWNER_COOKIE = `sd_session=${signSession({ email: process.env.OWNER_EMAIL })}`;

test.use({ viewport: { width: 1400, height: 900 } });

const DESIGN = {
  title: "E2E Undo Bend",
  type: "flows",
  nodes: [
    { id: "gateway", position: { x: 0, y: 0 } },
    { id: "lambda", position: { x: 420, y: 0 } },
  ],
  edges: [{ id: "e1", source: "gateway", target: "lambda", label: "invoke" }],
};

// An SVG path has no box Playwright will call visible, so the line is clicked
// by coordinate at its own midpoint.
const midOfEdge = (page) => page.evaluate(() => {
  const path = document.querySelector(".react-flow__edge-path");
  const m = path.ownerSVGElement.getScreenCTM();
  const q = path.getPointAtLength(path.getTotalLength() / 2);
  return { x: q.x * m.a + q.y * m.c + m.e, y: q.x * m.b + q.y * m.d + m.f };
});
const pathD = (page) => page.$eval(".react-flow__edge-path", (e) => e.getAttribute("d"));

test("Cmd+Z undoes a hand-bent line, on the canvas and on the server", async ({ page, baseURL }) => {
  const api = await request.newContext({ baseURL });
  const create = await api.post("/api/ai/flows", { headers: { Authorization: `Bearer ${SECRET}` }, data: DESIGN });
  expect(create.status()).toBe(201);
  const id = (await create.json()).url.split("/?id=")[1];
  const bendInDb = async () => {
    const r = await api.get(`/api/flows/${id}`, { headers: { Cookie: OWNER_COOKIE } });
    const body = await r.json();
    return (body.diagram || body).edges?.[0]?.bend ?? null;
  };

  try {
    await page.context().addCookies([{ name: "sd_session", value: OWNER_COOKIE.split("=")[1], domain: "localhost", path: "/" }]);
    await page.goto(`/?id=${id}`);
    await page.waitForSelector(".react-flow__edge-path", { state: "attached" });
    await page.waitForTimeout(1500);

    const straight = await pathD(page);
    expect(await bendInDb()).toBeNull();

    // Select the edge, then drag its bend handle well off the straight run.
    const mid = await midOfEdge(page);
    await page.mouse.click(mid.x, mid.y);
    const handle = await page.waitForSelector(".sd-edge-bend", { state: "attached" });
    const box = await handle.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 160, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(1200);

    const bent = await pathD(page);
    expect(bent).not.toBe(straight);
    expect(await bendInDb()).not.toBeNull();

    await page.keyboard.press("Meta+z");
    await page.waitForTimeout(1500);
    expect(await pathD(page)).toBe(straight);
    // The line is straight again AND the server agrees, so a reload keeps it.
    expect(await bendInDb()).toBeNull();

    await page.keyboard.press("Meta+Shift+z");
    await page.waitForTimeout(1200);
    expect(await pathD(page)).toBe(bent);
  } finally {
    await api.patch(`/api/flows/${id}`, { headers: { Cookie: OWNER_COOKIE, "Content-Type": "application/json" }, data: { locked: false } }); // every flow starts delete-locked
    await api.delete(`/api/flows/${id}`, { headers: { Cookie: OWNER_COOKIE } });
    await api.delete(`/api/flows/${id}?purge=1`, { headers: { Cookie: OWNER_COOKIE } });
    await api.dispose();
  }
});
