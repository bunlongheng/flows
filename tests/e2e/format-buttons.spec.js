import { test, expect, request } from "@playwright/test";
import { signSession } from "../../lib/auth-session.js";
import { STROKE_PICKS, BG_PICKS, BORDER_WIDTHS, BORDER_STYLES, RADII, FONTS, FONT_SIZES, ALIGNS, ARROWS, FONT_STACK } from "../../src/style.js";

// Every tile in the panel, one by one, checked against what the canvas actually
// draws - not against what was stored. "It saved" was already true of controls
// that were reported as dead, because what makes a tile feel broken is the card
// or the line not moving. So each pick here is read back off the rendered DOM.
const SECRET = process.env.FLOWS_API_SECRET || "e2e-secret";
const OWNER_COOKIE = `sd_session=${signSession({ email: process.env.OWNER_EMAIL })}`;

test.use({ viewport: { width: 1500, height: 950 } });

const DESIGN = {
  title: "E2E Every Button",
  type: "flows",
  // The 2 cards are deliberately NOT aligned. Facing each other on one axis,
  // the router draws a step route as a plain straight run, and then "step" and
  // "straight" make the same path and the test cannot tell them apart.
  nodes: [{ id: "gateway", position: { x: 0, y: 0 } }, { id: "lambda", position: { x: 420, y: 260 } }],
  edges: [{ id: "e1", source: "gateway", target: "lambda", label: "invoke" }],
};

const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

const pick = (page, section, n) => page.evaluate(({ section, n }) => {
  const s = [...document.querySelectorAll(".sd-format-panel > div")].find((d) => d.firstChild?.firstChild?.textContent === section);
  if (!s) throw new Error(`no section ${section}`);
  s.lastChild.children[n].click();
}, { section, n });

const open = async (page, id) => {
  await page.context().addCookies([{ name: "sd_session", value: OWNER_COOKIE.split("=")[1], domain: "localhost", path: "/" }]);
  await page.goto(`/?id=${id}`);
  await page.waitForSelector(".react-flow__edge-path", { state: "attached" });
  await page.waitForTimeout(1500);
};

const make = async (api, title) => {
  const create = await api.post("/api/ai/flows", { headers: { Authorization: `Bearer ${SECRET}` }, data: { ...DESIGN, title } });
  expect(create.status()).toBe(201);
  return (await create.json()).url.split("/?id=")[1];
};

const drop = async (api, id) => {
  await api.patch(`/api/flows/${id}`, { headers: { Cookie: OWNER_COOKIE, "Content-Type": "application/json" }, data: { locked: false } }); // every flow starts delete-locked
  await api.delete(`/api/flows/${id}`, { headers: { Cookie: OWNER_COOKIE } });
  await api.delete(`/api/flows/${id}?purge=1`, { headers: { Cookie: OWNER_COOKIE } });
};


// A line is clicked on its path a third of the way along, not at the midpoint -
// the draggable step badge sits there and swallows the click.
const clickEdge = async (page) => {
  const pt = await page.evaluate(() => {
    const p = document.querySelector(".react-flow__edge-interaction") || document.querySelector(".react-flow__edge-path");
    const m = p.getPointAtLength(p.getTotalLength() * 0.3);
    const t = p.ownerSVGElement.getScreenCTM();
    return { x: m.x * t.a + m.y * t.c + t.e, y: m.x * t.b + m.y * t.d + t.f };
  });
  await page.mouse.click(pt.x, pt.y);
};

test("every tile in the line panel moves the line", async ({ page, baseURL }) => {
  const api = await request.newContext({ baseURL });
  const id = await make(api, "E2E Line Buttons");
  try {
    await open(page, id);
    await clickEdge(page);
    await page.waitForSelector(".sd-format-panel");
    await expect(page.locator(".sd-format-panel")).toContainText("Line");

    const drawn = () => page.$eval(".react-flow__edge-path", (e) => ({
      stroke: e.style.stroke, bw: e.style.strokeWidth,
      dashed: Boolean(e.style.strokeDasharray), d: e.getAttribute("d"),
    }));

    for (let i = 0; i < STROKE_PICKS.length; i++) {
      await pick(page, "Stroke", i);
      await expect.poll(async () => (await drawn()).stroke, { timeout: 4000 }).toBe(rgb(STROKE_PICKS[i]));
    }
    for (let i = 0; i < BORDER_WIDTHS.length; i++) {
      await pick(page, "Stroke width", i);
      await expect.poll(async () => (await drawn()).bw, { timeout: 4000 }).toBe(String(BORDER_WIDTHS[i]));
    }
    for (let i = 0; i < BORDER_STYLES.length; i++) {
      await pick(page, "Stroke style", i);
      await expect.poll(async () => (await drawn()).dashed, { timeout: 4000 }).toBe(BORDER_STYLES[i] !== "solid");
    }

    // Arrow type is the row that reads as dead when it fails, because the only
    // evidence it worked is the shape of the path. A curve is a cubic, a
    // straight run is one L and nothing else, an elbow is neither.
    const straight = (d) => /^M[\d.,-]+ L[\d.,-]+$/.test(d);
    const shape = { curved: (d) => d.includes("C"), straight, step: (d) => !d.includes("C") && !straight(d) };
    for (let i = 0; i < ARROWS.length; i++) {
      await pick(page, "Arrow type", i);
      await expect.poll(async () => shape[ARROWS[i]]((await drawn()).d), { timeout: 4000 }).toBe(true);
    }
  } finally {
    await drop(api, id);
    await api.dispose();
  }
});
