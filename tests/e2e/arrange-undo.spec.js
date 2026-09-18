import { test, expect, request } from "@playwright/test";
import { signSession } from "../../lib/auth-session.js";

// Undo/redo for the canvas. Both dragging and Arrange are reversible, Arrange
// being the click that can wipe a hand-placed layout in one go. The buttons stay
// out of the toolbar until there is actually something to undo.
const SECRET = process.env.FLOWS_API_SECRET || "e2e-secret";
const OWNER_COOKIE = `sd_session=${signSession({ email: process.env.OWNER_EMAIL })}`;

test.use({ viewport: { width: 1440, height: 900 } });

const DESIGN = {
  title: "E2E Undo Redo",
  type: "flows",
  // Deliberately scattered, so dagre's tidy result is clearly a different layout.
  nodes: [
    { id: "user", position: { x: 80, y: 120 } },
    { id: "cloudfront", position: { x: 420, y: 300 } },
    { id: "lambda", position: { x: 760, y: 60 } },
    { id: "dynamo", position: { x: 1100, y: 380 } },
  ],
  edges: [
    { id: "e1", source: "user", target: "cloudfront" },
    { id: "e2", source: "cloudfront", target: "lambda" },
    { id: "e3", source: "lambda", target: "dynamo" },
  ],
};

const at = (page, id) =>
  page.locator(`.react-flow__node-awsNode[data-id="${id}"]`).evaluate(el => el.style.transform);

test("undo and redo cover both dragging and Arrange", async ({ page, context, baseURL }) => {
  const api = await request.newContext({ baseURL });
  const create = await api.post("/api/ai/flows", {
    headers: { Authorization: `Bearer ${SECRET}` },
    data: DESIGN,
  });
  expect(create.status()).toBe(201);
  const { url } = await create.json();
  const id = url.split("/?id=")[1];
  await api.patch(`/api/flows/${id}`, {
    headers: { Cookie: OWNER_COOKIE, "Content-Type": "application/json" },
    data: { is_public: true },
  });

  // These exercise OWNER editing: the canvas is read-only for a visitor.
  await context.addCookies([{ name: "sd_session", value: OWNER_COOKIE.split("=")[1], url: baseURL }]);

  try {
    await page.goto(`/?id=${id}`);
    await page.waitForSelector(".react-flow__node-awsNode");

    const undo = page.locator("header button", { hasText: /^Undo$/ });
    const redo = page.locator("header button", { hasText: /^Redo$/ });

    // Nothing done yet, so no undo chrome at all.
    await expect(undo).toHaveCount(0);
    await expect(redo).toHaveCount(0);

    const start = await at(page, "dynamo");

    // 1. A drag is one history step.
    const box = await page.locator('.react-flow__node-awsNode[data-id="dynamo"]').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 90, box.y + 70, { steps: 8 });
    await page.mouse.up();
    await expect(undo).toHaveCount(1);
    const dragged = await at(page, "dynamo");
    expect(dragged).not.toBe(start);

    await undo.click();
    await expect.poll(() => at(page, "dynamo")).toBe(start);
    await expect(redo).toHaveCount(1);

    await redo.click();
    await expect.poll(() => at(page, "dynamo")).toBe(dragged);

    // 2. The keyboard does the same thing.
    await page.keyboard.press("Meta+z");
    await expect.poll(() => at(page, "dynamo")).toBe(start);
    await page.keyboard.press("Meta+Shift+z");
    await expect.poll(() => at(page, "dynamo")).toBe(dragged);

    // 3. Arrange is reversible too, and history stacks: undoing twice walks back
    //    the arrange AND the drag underneath it.
    await page.getByRole("button", { name: "Arrange" }).click();
    await expect.poll(() => at(page, "dynamo")).not.toBe(dragged);

    await undo.click();
    await expect.poll(() => at(page, "dynamo")).toBe(dragged);
    await undo.click();
    await expect.poll(() => at(page, "dynamo")).toBe(start);
  } finally {
    await api.delete(`/api/flows/${id}`, { headers: { Cookie: OWNER_COOKIE } });
    await api.dispose();
  }
});
