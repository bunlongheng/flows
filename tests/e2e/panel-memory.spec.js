import { test, expect, request } from "@playwright/test";
import { signSession } from "../../lib/auth-session.js";

// Panel state survives BACK TO THE GALLERY AND REOPEN, not just a reload.
//
// Those are different paths. A reload refetches the design; reopening from the
// gallery uses the list that was fetched once at page load, and that copy of
// view_state goes stale the moment a panel is toggled. Reopening from the stale
// row reset the panels - and the reset was then SAVED, destroying the real state,
// so the next reload lost it too. The reload-only spec could never have caught it.
const SECRET = process.env.FLOWS_API_SECRET || "e2e-secret";
const OWNER_COOKIE = `sd_session=${signSession({ email: process.env.OWNER_EMAIL })}`;

test.use({ viewport: { width: 1500, height: 950 } });

const DESIGN = {
  title: "E2E Panel Memory",
  type: "flows",
  nodes: [{ id: "user" }, { id: "apigw" }, { id: "lambda" }],
  edges: [
    { source: "user", target: "apigw", label: "one" },
    { source: "apigw", target: "lambda", label: "two" },
  ],
};

test("Steps survives back-to-gallery and reopen, and off stays off", async ({ page, context, baseURL }) => {
  const api = await request.newContext({ baseURL });
  const create = await api.post("/api/ai/flows", {
    headers: { Authorization: `Bearer ${SECRET}` },
    data: DESIGN,
  });
  const id = (await create.json()).url.split("/?id=")[1];

  try {
    await context.addCookies([{ name: "sd_session", value: OWNER_COOKIE.split("=")[1], url: baseURL }]);
    const btn = (name) => page.locator(`button:has-text("${name}")`).first();
    const on = async (name) => (await btn(name).evaluate((e) => e.className)).includes("is-on");
    const card = () => page.locator(`button.dc-open[aria-label*="${DESIGN.title}"]`).first();

    const openFromGallery = async () => {
      await page.goto("/");
      await card().waitFor({ timeout: 20000 });
      await card().click();
      await page.waitForSelector(".react-flow__node", { timeout: 20000 });
    };

    await openFromGallery();
    if (!(await on("Steps"))) await btn("Steps").click();
    await expect.poll(() => on("Steps")).toBe(true);
    // Let the save land before navigating away.
    await page.waitForResponse((r) => r.request().method() === "PATCH" && r.status() === 200);

    // Back to the gallery, then reopen from it - the path that used to reset it.
    await page.locator("header button").first().click();
    await card().waitFor({ timeout: 20000 });
    await card().click();
    await page.waitForSelector(".react-flow__node", { timeout: 20000 });
    await expect.poll(() => on("Steps"), { timeout: 10000 }).toBe(true);

    // A reload must agree - if the reopen had saved a reset, this is where it showed.
    await page.reload();
    await page.waitForSelector(".react-flow__node", { timeout: 20000 });
    await expect.poll(() => on("Steps"), { timeout: 10000 }).toBe(true);

    // Turning it OFF has to stick too, not just on.
    await btn("Steps").click();
    await expect.poll(() => on("Steps")).toBe(false);
    await page.waitForResponse((r) => r.request().method() === "PATCH" && r.status() === 200);
    await page.locator("header button").first().click();
    await card().waitFor({ timeout: 20000 });
    await card().click();
    await page.waitForSelector(".react-flow__node", { timeout: 20000 });
    await expect.poll(() => on("Steps"), { timeout: 10000 }).toBe(false);
  } finally {
    await api.delete(`/api/flows/${id}`, { headers: { Cookie: OWNER_COOKIE } });
    await api.delete(`/api/flows/${id}?purge=1`, { headers: { Cookie: OWNER_COOKIE } });
    await api.dispose();
  }
});

// A visitor on a shared link sees the diagram the way the owner left it: the
// saved Steps state comes through, the share panel never does, and there is no
// toolbar to change any of it.
test("a visitor on a shared link gets the owner's steps but no share panel and no toolbar", async ({ browser, baseURL }) => {
  const api = await request.newContext({ baseURL });
  const create = await api.post("/api/ai/flows", {
    headers: { Authorization: `Bearer ${SECRET}` },
    data: { ...DESIGN, title: `${DESIGN.title} visitor`, is_public: true },
  });
  const id = (await create.json()).url.split("/?id=")[1];
  try {
    const saved = await api.patch(`/api/flows/${id}`, {
      headers: { cookie: OWNER_COOKIE },
      data: { view_state: { panels: ["share", "steps"], badge: "dark" } },
    });
    expect(saved.ok()).toBe(true);
    const row = await (await api.get(`/api/flows/${id}`)).json();

    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); // no cookie: a recipient on a phone
    const page = await ctx.newPage();
    await page.goto(`/demo?name=${row.slug}`);
    await page.waitForSelector(".react-flow__node", { timeout: 20000 });
    await page.waitForTimeout(800);
    await expect(page.locator(".sd-share-panel")).toHaveCount(0);
    await expect(page.locator(".react-flow.sd-steps-on")).toHaveCount(1);
    await expect(page.locator(".sd-detail-actions")).toHaveCount(0);
    await expect(page.locator('header button:has-text("Steps")')).toHaveCount(0);
    await ctx.close();
  } finally {
    await api.delete(`/api/flows/${id}`, { headers: { cookie: OWNER_COOKIE } });
  }
});
