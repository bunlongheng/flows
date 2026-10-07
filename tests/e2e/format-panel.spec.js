import { test, expect, request } from "@playwright/test";
import { signSession } from "../../lib/auth-session.js";

// The format panel is only real if a click on a swatch reaches the rendered
// card AND the row. Both halves are checked here, because a panel that paints
// but does not persist is the same defect as one that persists but does not
// paint - and neither shows up in a unit test.
const SECRET = process.env.FLOWS_API_SECRET || "e2e-secret";
const OWNER_COOKIE = `sd_session=${signSession({ email: process.env.OWNER_EMAIL })}`;

test.use({ viewport: { width: 1500, height: 950 } });

// 13s of this file's budget is deliberate settle time - a picked colour has to
// reach the row before the row is read back - and on top of that each test does
// a full reload and 4 API round trips. That fits the flat 30s alone but not when
// the whole browser project is hammering one server from several workers, where
// it times out on timing rather than on anything being wrong. Give it room: the
// point is to catch a panel that does not persist, not to race a build machine.
test.describe.configure({ timeout: 60_000 });

const DESIGN = {
  title: "E2E Format Panel",
  type: "flows",
  nodes: [{ id: "gateway", position: { x: 0, y: 0 } }, { id: "lambda", position: { x: 380, y: 0 } }],
  edges: [{ id: "e1", source: "gateway", target: "lambda", label: "invoke" }],
};

// Sections are addressed by their visible label, the same way the owner does.
const pick = (page, section, n) => page.evaluate(({ section, n }) => {
  // Each section is a label line then a row of controls, so the name is the
  // label line's first child - the line itself can also carry the current colour.
  const s = [...document.querySelectorAll(".sd-format-panel > div")].find((d) => d.firstChild?.firstChild?.textContent === section);
  s.lastChild.children[n].click();
}, { section, n });

test("a clicked card lights its lines and opens no panel", async ({ page, baseURL }) => {
  const api = await request.newContext({ baseURL });
  const create = await api.post("/api/ai/flows", { headers: { Authorization: `Bearer ${SECRET}` }, data: DESIGN });
  expect(create.status()).toBe(201);
  const id = (await create.json()).url.split("/?id=")[1];

  try {
    await page.context().addCookies([{ name: "sd_session", value: OWNER_COOKIE.split("=")[1], domain: "localhost", path: "/" }]);
    await page.goto(`/?id=${id}`);
    await page.waitForSelector(".react-flow__node");
    await page.waitForTimeout(1500);

    // No selection: no panel, no glow.
    expect(await page.$(".sd-format-panel")).toBeNull();
    expect(await page.locator(".sd-edge-glow").count()).toBe(0);

    // A card click is about the card's traffic, not its styling: every line in
    // and out of it glows and the panel stays shut (owner rule 2026-10-04).
    await page.click(".react-flow__node");
    await expect(page.locator(".sd-edge-glow")).toHaveCount(1);
    await page.waitForTimeout(400);
    expect(await page.$(".sd-format-panel")).toBeNull();

    // Clicking empty canvas drops the selection and the glow with it. The left
    // margin of the pane: a 2-card diagram is fitted big and its note boxes
    // reach well down the page, so the bottom-right is not empty.
    await page.locator(".react-flow__pane").click({ position: { x: 20, y: 300 } });
    await expect(page.locator(".sd-edge-glow")).toHaveCount(0);
  } finally {
    await api.patch(`/api/flows/${id}`, { headers: { Cookie: OWNER_COOKIE, "Content-Type": "application/json" }, data: { locked: false } }); // every flow starts delete-locked
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
    await api.patch(`/api/flows/${id}`, { headers: { Cookie: OWNER_COOKIE, "Content-Type": "application/json" }, data: { locked: false } }); // every flow starts delete-locked
    await api.delete(`/api/flows/${id}`, { headers: { Cookie: OWNER_COOKIE } });
    await api.delete(`/api/flows/${id}?purge=1`, { headers: { Cookie: OWNER_COOKIE } });
    await api.dispose();
  }
});

// A hand bend beats a picked arrow type in the renderer, so on a line that had
// been dragged into a curve the Arrow type row did nothing at all: the pick
// saved, the canvas never moved, and the row read as a dead control.
test("an arrow type picked on a hand-bent line replaces the bend", async ({ page, baseURL }) => {
  const api = await request.newContext({ baseURL });
  const create = await api.post("/api/ai/flows", { headers: { Authorization: `Bearer ${SECRET}` }, data: { ...DESIGN, title: "E2E Bent Line" } });
  expect(create.status()).toBe(201);
  const id = (await create.json()).url.split("/?id=")[1];
  const stored = async () => {
    const body = await (await api.get(`/api/flows/${id}`, { headers: { Cookie: OWNER_COOKIE } })).json();
    return (body.data?.edges || body.edges)[0];
  };

  try {
    // Bend it the way a drag would, through the same PATCH the drag uses.
    await api.patch(`/api/flows/${id}`, { headers: { Cookie: OWNER_COOKIE }, data: { edges: [{ id: "e1", bend: { t: 0.5, d: 120 } }] } });
    expect((await stored()).bend).toEqual({ t: 0.5, d: 120 });

    await page.context().addCookies([{ name: "sd_session", value: OWNER_COOKIE.split("=")[1], domain: "localhost", path: "/" }]);
    await page.goto(`/?id=${id}`);
    await page.waitForSelector(".react-flow__edge-path", { state: "attached" });
    await page.waitForTimeout(1500);

    const d = () => page.$eval(".react-flow__edge-path", (e) => e.getAttribute("d"));
    const bent = await d();
    expect(bent).toContain("Q"); // a hand bend is a quadratic

    await clickEdge(page);
    await page.waitForSelector(".sd-format-panel");
    // While bent, no arrow type is in effect, so the row shows the default lit.
    await pick(page, "Arrow type", 2); // straight
    await page.waitForTimeout(1200);

    const after = await d();
    expect(after).not.toContain("Q");
    expect(after).not.toBe(bent);
    const row = await stored();
    expect(row.style.arrow).toBe("straight");
    expect(row).not.toHaveProperty("bend");
  } finally {
    await api.patch(`/api/flows/${id}`, { headers: { Cookie: OWNER_COOKIE, "Content-Type": "application/json" }, data: { locked: false } }); // every flow starts delete-locked
    await api.delete(`/api/flows/${id}`, { headers: { Cookie: OWNER_COOKIE } });
    await api.delete(`/api/flows/${id}?purge=1`, { headers: { Cookie: OWNER_COOKIE } });
    await api.dispose();
  }
});

// The other tests here pick with element.click(), which dispatches the click
// straight to the button. A real pointer is mousedown then mouseup, and the
// browser only fires click when both land on the SAME element. Tile used to be
// declared inside FormatPanel, so every tile was remounted each animation
// frame and a real click never fired while the JS click passed. This one
// presses the mouse the way the owner does.
test("a real pointer click on a tile changes the line", async ({ page, baseURL }) => {
  const api = await request.newContext({ baseURL });
  const create = await api.post("/api/ai/flows", { headers: { Authorization: `Bearer ${SECRET}` }, data: { ...DESIGN, title: "E2E Real Click" } });
  expect(create.status()).toBe(201);
  const id = (await create.json()).url.split("/?id=")[1];

  try {
    await page.context().addCookies([{ name: "sd_session", value: OWNER_COOKIE.split("=")[1], domain: "localhost", path: "/" }]);
    await page.goto(`/?id=${id}`);
    await page.waitForSelector(".react-flow__node");
    await page.waitForTimeout(1500);
    await clickEdge(page);
    await page.waitForSelector(".sd-format-panel");
    // The panel slides in over 0.2s; a box measured mid-slide is 16px off.
    await page.waitForTimeout(400);

    // Coordinates, not the element: if the button under the pointer is replaced
    // between down and up, a locator click would silently retarget it.
    const box = await page.locator(".sd-format-panel button[title='4px']").boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(120);
    await page.mouse.up();

    await expect.poll(() => page.$eval(".react-flow__edge-path", (e) => e.style.strokeWidth)).toBe("4");
    await page.waitForTimeout(1200);
    const saved = await (await api.get(`/api/flows/${id}`, { headers: { Cookie: OWNER_COOKIE } })).json();
    expect((saved.data?.edges || saved.edges).find((e) => e.id === "e1").style).toMatchObject({ bw: 4 });
  } finally {
    await api.patch(`/api/flows/${id}`, { headers: { Cookie: OWNER_COOKIE, "Content-Type": "application/json" }, data: { locked: false } }); // every flow starts delete-locked
    await api.delete(`/api/flows/${id}`, { headers: { Cookie: OWNER_COOKIE } });
    await api.delete(`/api/flows/${id}?purge=1`, { headers: { Cookie: OWNER_COOKIE } });
    await api.dispose();
  }
});
