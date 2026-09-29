import { test, expect, request } from "@playwright/test";
import { signSession } from "../../lib/auth-session.js";

// The format panel is only real if a click on a swatch reaches the rendered
// card AND the row. Both halves are checked here, because a panel that paints
// but does not persist is the same defect as one that persists but does not
// paint - and neither shows up in a unit test.
const SECRET = process.env.FLOWS_API_SECRET || "e2e-secret";
const OWNER_COOKIE = `sd_session=${signSession({ email: process.env.OWNER_EMAIL })}`;

test.use({ viewport: { width: 1500, height: 950 } });

const DESIGN = {
  title: "E2E Format Panel",
  type: "flows",
  nodes: [{ id: "gateway", position: { x: 0, y: 0 } }, { id: "lambda", position: { x: 380, y: 0 } }],
  edges: [{ id: "e1", source: "gateway", target: "lambda", label: "invoke" }],
};

// Sections are addressed by their visible label, the same way the owner does.
const pick = (page, section, n) => page.evaluate(({ section, n }) => {
  const s = [...document.querySelectorAll(".sd-format-panel > div")].find((d) => d.firstChild?.textContent === section);
  s.lastChild.children[n].click();
}, { section, n });

test("the format panel styles the selected card and the style survives a reload", async ({ page, baseURL }) => {
  const api = await request.newContext({ baseURL });
  const create = await api.post("/api/ai/flows", { headers: { Authorization: `Bearer ${SECRET}` }, data: DESIGN });
  expect(create.status()).toBe(201);
  const id = (await create.json()).url.split("/?id=")[1];

  try {
    await page.context().addCookies([{ name: "sd_session", value: OWNER_COOKIE.split("=")[1], domain: "localhost", path: "/" }]);
    await page.goto(`/?id=${id}`);
    await page.waitForSelector(".react-flow__node");
    await page.waitForTimeout(1500);

    // No selection, no panel: it is not another toggle in the header.
    expect(await page.$(".sd-format-panel")).toBeNull();
    await page.click(".react-flow__node");
    await page.waitForSelector(".sd-format-panel");

    await pick(page, "Stroke", 1);       // #e03131
    await pick(page, "Background", 4);   // #ffec99
    await pick(page, "Stroke width", 2); // 4px
    await pick(page, "Stroke style", 2); // dotted
    await pick(page, "Edges", 1);        // 12px radius
    await page.waitForTimeout(1200);

    const card = () => page.$eval(".react-flow__node > div", (e) => {
      const c = getComputedStyle(e);
      return { border: c.border, radius: c.borderRadius, bg: c.backgroundColor };
    });
    expect(await card()).toEqual({ border: "4px dotted rgb(224, 49, 49)", radius: "12px", bg: "rgb(255, 236, 153)" });

    // The row, not just the DOM: reload and the card comes back styled.
    const saved = await (await api.get(`/api/flows/${id}`, { headers: { Cookie: OWNER_COOKIE } })).json();
    const stored = (saved.data?.nodes || saved.nodes).find((n) => n.id === "gateway");
    expect(stored.style).toEqual({ stroke: "#e03131", bg: "#ffec99", bw: 4, bs: "dotted", radius: 12 });

    await page.reload();
    await page.waitForSelector(".react-flow__node");
    await page.waitForTimeout(1500);
    expect((await card()).border).toBe("4px dotted rgb(224, 49, 49)");

    // Reset puts it back, and clears the key rather than storing a default look.
    await page.click(".react-flow__node");
    await page.waitForSelector(".sd-format-panel");
    await page.click(".sd-format-panel button:has-text('Reset')");
    await page.waitForTimeout(1200);
    expect((await card()).border).toBe("1px solid rgb(232, 27, 126)");
    const after = await (await api.get(`/api/flows/${id}`, { headers: { Cookie: OWNER_COOKIE } })).json();
    expect((after.data?.nodes || after.nodes).find((n) => n.id === "gateway")).not.toHaveProperty("style");
  } finally {
    await api.delete(`/api/flows/${id}`, { headers: { Cookie: OWNER_COOKIE } });
    await api.delete(`/api/flows/${id}?purge=1`, { headers: { Cookie: OWNER_COOKIE } });
    await api.dispose();
  }
});

// A line is clicked on its path, not its bounding box: the box's centre can sit
// well off a routed edge, and a miss here would select nothing and pass anyway.
// A third of the way along, not half - the draggable step badge sits at the
// midpoint and swallows the click.
const clickEdge = async (page) => {
  const pt = await page.evaluate(() => {
    const p = document.querySelector(".react-flow__edge-interaction") || document.querySelector(".react-flow__edge-path");
    const m = p.getPointAtLength(p.getTotalLength() * 0.3);
    const t = p.ownerSVGElement.getScreenCTM();
    return { x: m.x * t.a + m.y * t.c + t.e, y: m.x * t.b + m.y * t.d + t.f };
  });
  await page.mouse.click(pt.x, pt.y);
};

test("the format panel styles the selected line and offers it only what a stroke can use", async ({ page, baseURL }) => {
  const api = await request.newContext({ baseURL });
  const create = await api.post("/api/ai/flows", { headers: { Authorization: `Bearer ${SECRET}` }, data: { ...DESIGN, title: "E2E Line Panel" } });
  expect(create.status()).toBe(201);
  const id = (await create.json()).url.split("/?id=")[1];

  try {
    await page.context().addCookies([{ name: "sd_session", value: OWNER_COOKIE.split("=")[1], domain: "localhost", path: "/" }]);
    await page.goto(`/?id=${id}`);
    await page.waitForSelector(".react-flow__edge-path", { state: "attached" });
    await page.waitForTimeout(1500);

    await clickEdge(page);
    await page.waitForSelector(".sd-format-panel");
    // A line has no inside, no corners and no text of its own.
    await expect(page.locator(".sd-format-panel")).toContainText("Line");
    await expect(page.locator(".sd-format-panel")).not.toContainText("Background");
    await expect(page.locator(".sd-format-panel")).not.toContainText("Font family");

    await pick(page, "Stroke", 3);       // #1971c2
    await pick(page, "Stroke width", 2); // 4px
    await pick(page, "Stroke style", 1); // dashed
    await page.waitForTimeout(1200);

    const line = () => page.$eval(".react-flow__edge-path", (e) => ({ stroke: e.style.stroke, w: e.style.strokeWidth, dash: e.style.strokeDasharray }));
    const painted = await line();
    // A picked colour REPLACES the from/to gradient rather than tinting it.
    expect(painted.stroke).toBe("rgb(25, 113, 194)");
    expect(painted.dash).not.toBe("");

    const saved = await (await api.get(`/api/flows/${id}`, { headers: { Cookie: OWNER_COOKIE } })).json();
    expect((saved.data?.edges || saved.edges)[0].style).toEqual({ stroke: "#1971c2", bw: 4, bs: "dashed" });
    // The badge pin the pins branch owns is not collateral damage.
    expect((saved.data?.edges || saved.edges)[0].label).toBe("invoke");

    await page.reload();
    await page.waitForSelector(".react-flow__edge-path", { state: "attached" });
    await page.waitForTimeout(1500);
    expect((await line()).stroke).toBe("rgb(25, 113, 194)");

    await clickEdge(page);
    await page.waitForSelector(".sd-format-panel");
    await page.click(".sd-format-panel button:has-text('Reset')");
    await page.waitForTimeout(1200);
    expect((await line()).stroke).toContain("url(");
    const after = await (await api.get(`/api/flows/${id}`, { headers: { Cookie: OWNER_COOKIE } })).json();
    expect((after.data?.edges || after.edges)[0]).not.toHaveProperty("style");
  } finally {
    await api.delete(`/api/flows/${id}`, { headers: { Cookie: OWNER_COOKIE } });
    await api.delete(`/api/flows/${id}?purge=1`, { headers: { Cookie: OWNER_COOKIE } });
    await api.dispose();
  }
});
