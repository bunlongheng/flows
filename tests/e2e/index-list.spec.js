import { test, expect, request } from "@playwright/test";
import { signSession } from "../../lib/auth-session.js";

// The list is the front door and had no cover at all. Every assertion here is
// something the owner does on the way in: find a diagram, narrow the list, open
// one, and get back out again.
const SECRET = process.env.FLOWS_API_SECRET || "e2e-secret";
const OWNER_COOKIE = `sd_session=${signSession({ email: process.env.OWNER_EMAIL })}`;

test.use({ viewport: { width: 1400, height: 950 } });

const DESIGN = (title) => ({
  title,
  type: "flows",
  nodes: [{ id: "gateway", position: { x: 0, y: 0 } }, { id: "lambda", position: { x: 420, y: 260 } }],
  edges: [{ id: "e1", source: "gateway", target: "lambda", label: "invoke" }],
});

const tiles = (page) => page.locator(".dc-card");

test("the index lists, searches and opens, and back gets out again", async ({ page, baseURL }) => {
  const api = await request.newContext({ baseURL });
  // A word that cannot collide with a real row, so the count is exact.
  const tag = `Zqx${Date.now()}`;
  const made = [];
  for (const n of [1, 2]) {
    const r = await api.post("/api/ai/flows", { headers: { Authorization: `Bearer ${SECRET}` }, data: DESIGN(`${tag} Flow ${n}`) });
    expect(r.status()).toBe(201);
    made.push((await r.json()).url.split("/?id=")[1]);
  }

  try {
    await page.context().addCookies([{ name: "sd_session", value: OWNER_COOKIE.split("=")[1], domain: "localhost", path: "/" }]);
    await page.goto("/");
    await page.waitForSelector(".dc-card");

    // Search narrows to exactly the 2 just created, and clearing brings it back.
    // Searched FIRST: the grid streams in, so a count taken the moment the
    // first tile appears is whatever had arrived by then, not the list.
    await page.fill("input[placeholder*='Search']", tag);
    await expect(tiles(page)).toHaveCount(2);
    await page.fill("input[placeholder*='Search']", `${tag}zzz`);
    await expect(tiles(page)).toHaveCount(0);
    await page.fill("input[placeholder*='Search']", "");
    await expect(tiles(page)).not.toHaveCount(0);
    const all = await tiles(page).count();
    expect(all).toBeGreaterThanOrEqual(2);

    // The Demos tab is a different roster, and coming back restores the owner's.
    await page.click("button:has-text('Demos')");
    await page.waitForTimeout(1200);
    await page.click("button:has-text('My Diagrams')");
    await expect(tiles(page)).toHaveCount(all);

    // Opening one leaves the list for the canvas and names it in the URL.
    await page.fill("input[placeholder*='Search']", tag);
    await expect(tiles(page)).toHaveCount(2);
    await page.click(".dc-card .dc-open");
    await page.waitForSelector(".react-flow__node");
    expect(page.url()).toContain("name=");

    // The header arrow clears ?name= as well as changing the view. Leaving the
    // slug behind meant the address bar still named a flow while the list was
    // up, so a reload or a copied link went straight back into it.
    await page.click("button[aria-label='Back to gallery']");
    await page.waitForSelector(".dc-card");
    expect(new URL(page.url()).search).toBe("");

    // And the browser's own Back, which is the only back a phone has. Opening a
    // flow used to REPLACE the list's history entry, so this left the app.
    await page.click(".dc-card .dc-open");
    await page.waitForSelector(".react-flow__node");
    await page.goBack();
    await page.waitForSelector(".dc-card");
    expect(new URL(page.url()).pathname).toBe("/");
    expect(await tiles(page).count()).toBeGreaterThanOrEqual(1);

    // Forward returns to the flow, since the entry is a real one now.
    await page.goForward();
    await page.waitForSelector(".react-flow__node");
    expect(page.url()).toContain("name=");
  } finally {
    for (const id of made) {
      await api.patch(`/api/flows/${id}`, { headers: { Cookie: OWNER_COOKIE, "Content-Type": "application/json" }, data: { locked: false } }); // every flow starts delete-locked
      await api.delete(`/api/flows/${id}`, { headers: { Cookie: OWNER_COOKIE } });
      await api.delete(`/api/flows/${id}?purge=1`, { headers: { Cookie: OWNER_COOKIE } });
    }
    await api.dispose();
  }
});
