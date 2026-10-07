import { test, expect, request } from "@playwright/test";
import { signSession } from "../../lib/auth-session.js";

// Browser e2e for drag snap-align. Snapping is ON for every drag: a moving card
// suggests where it lands, and Cmd/Ctrl/Shift SUSPENDS it so the card can be
// placed by hand. So this proves both halves - the modifier parks a card 5px off
// the line untouched, and letting it go paints the yellow guide AND actually
// lands the card on the neighbour's line when released (the release is the part
// that silently breaks if the snap is applied to the node instead of to the
// position change).
const SECRET = process.env.FLOWS_API_SECRET || "e2e-secret";
const OWNER_COOKIE = `sd_session=${signSession({ email: process.env.OWNER_EMAIL })}`;

// A roomy viewport keeps the drag away from the canvas edges, where React Flow
// auto-pans and the geometry stops being predictable.
test.use({ viewport: { width: 1440, height: 900 } });

const DESIGN = {
  title: "E2E Snap Align",
  type: "flows",
  nodes: [
    { id: "user", position: { x: 100, y: 100 } },
    { id: "lambda", position: { x: 500, y: 420 } },
  ],
  edges: [{ id: "e1", source: "user", target: "lambda", label: "invoke" }],
};

// React Flow writes positions as `transform: translate(Xpx, Ypx)` on the node.
const flowY = async locator => {
  const t = await locator.evaluate(el => el.style.transform);
  return Number(t.match(/translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/)[2]);
};

test("a drag snaps a node onto its neighbour's line, and Cmd suspends it", async ({ page, context, baseURL }) => {
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

    const anchor = page.locator('.react-flow__node-awsNode[data-id="user"]');
    const moving = page.locator('.react-flow__node-awsNode[data-id="lambda"]');
    const anchorY = await flowY(anchor);
    expect(await flowY(moving)).not.toBe(anchorY);

    const zoom = await page.evaluate(() =>
      Number(document.querySelector(".react-flow__viewport").style.transform.match(/scale\(([\d.]+)\)/)[1]),
    );
    const box = await moving.boundingBox();
    let px = box.x + box.width / 2;
    let py = box.y + 8;

    // Hold Cmd for the whole approach: that suspends snapping, which is the only
    // way to park the card 5px shy of the anchor's line - inside the 10px latch -
    // and have it stay there. The key goes down AFTER the mouse, so the drag
    // starts on a plain press and no modifier can be mistaken for a gesture.
    // Correct from the node's real position each step: React Flow auto-pans near
    // the canvas edge, so a delta computed up front lands somewhere else.
    await page.mouse.move(px, py);
    await page.mouse.down();
    await page.keyboard.down("Meta");
    for (let i = 0; i < 12; i++) {
      const off = (await flowY(moving)) - anchorY - 5;
      if (Math.abs(off) < 1) break;
      py -= off * zoom;
      await page.mouse.move(px, py, { steps: 4 });
    }
    // Suspended means untouched: 5px off the line, and no guide offering help.
    expect(await flowY(moving)).toBeCloseTo(anchorY + 5, 0);
    await expect(page.locator(".sd-snap-guide")).toHaveCount(0);

    // Let the modifier go and nudge 1px: snapping is back on and 5px is close
    // enough to latch.
    await page.keyboard.up("Meta");
    await page.mouse.move(px, py - 1, { steps: 2 });

    // The yellow guide is on screen while the snap is engaged.
    await expect(page.locator(".sd-snap-guide")).toHaveCount(1);

    await page.mouse.up();

    // ...and it lands exactly on the anchor's line, then the guide goes away.
    expect(await flowY(moving)).toBe(anchorY);
    await expect(page.locator(".sd-snap-guide")).toHaveCount(0);
  } finally {
    await api.patch(`/api/flows/${id}`, { headers: { Cookie: OWNER_COOKIE, "Content-Type": "application/json" }, data: { locked: false } }); // every flow starts delete-locked
    await api.delete(`/api/flows/${id}`, { headers: { Cookie: OWNER_COOKIE } });
    await api.dispose();
  }
});
