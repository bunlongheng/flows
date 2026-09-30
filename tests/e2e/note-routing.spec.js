import { test, expect, request } from "@playwright/test";
import { signSession } from "../../lib/auth-session.js";

// A note hangs below its card and React Flow never measures it. The line from
// a bottom face now runs to the card's own border, under the note, because a
// connector that stopped at the note's foot read as one that never arrived. So
// the assertions are: the path starts on the card's bottom edge, and the note
// paints over the line rather than the line over the note.
//
// This is a geometry fact about the rendered DOM, so it can only be checked in
// a real browser.
const SECRET = process.env.FLOWS_API_SECRET || "e2e-secret";
const OWNER_COOKIE = `sd_session=${signSession({ email: process.env.OWNER_EMAIL })}`;

test.use({ viewport: { width: 1200, height: 1000 } });

// A column wired top to bottom: every edge leaves a bottom face that has a note
// under it. Long enough notes that the boxes wrap to several lines.
const DESIGN = {
  title: "E2E Note Routing",
  type: "flows",
  nodes: [
    { id: "apigw", position: { x: 300, y: 0 }, note: "Step 1 Prompt. Asks for a TTL memoizer: configurable TTL, per-key blocking, cancellation keeps the load alive." },
    { id: "codebuild", position: { x: 300, y: 400 }, note: "Step 4 Hidden tests. lib/cache/fncache_test.go, package cache. TestFnCacheSanity and TestFnCacheCancellation call newFnCache and Get directly." },
    { id: "lambda", position: { x: 300, y: 800 }, note: "Step 5 Runs the build." },
  ],
  edges: [
    { id: "e1", source: "apigw", target: "codebuild", label: "pass or fail" },
    { id: "e2", source: "codebuild", target: "lambda", label: "tests written against gold" },
  ],
};

test("a line from a bottom face reaches the card under its note", async ({ page, baseURL }) => {
  const api = await request.newContext({ baseURL });
  const create = await api.post("/api/ai/flows", { headers: { Authorization: `Bearer ${SECRET}` }, data: DESIGN });
  expect(create.status()).toBe(201);
  const id = (await create.json()).url.split("/?id=")[1];

  try {
    await page.context().addCookies([{ name: "sd_session", value: OWNER_COOKIE.split("=")[1], domain: "localhost", path: "/" }]);
    await page.goto(`/?id=${id}`);
    await page.waitForSelector(".sd-note-box");
    await page.waitForTimeout(2500); // notes measure, then the edges re-route

    const probe = await page.evaluate(() => {
      const node = (id) => document.querySelector(`.react-flow__node[data-id="${id}"]`);
      const out = [];
      for (const [eid, src] of [["e1", "apigw"], ["e2", "codebuild"]]) {
        const path = document.querySelector(`.react-flow__edge[data-id="${eid}"] .react-flow__edge-path`);
        const ctm = path.ownerSVGElement.getScreenCTM();
        const p = path.getPointAtLength(0);
        const x = p.x * ctm.a + p.y * ctm.c + ctm.e, y = p.x * ctm.b + p.y * ctm.d + ctm.f;
        const card = node(src).firstElementChild;
        const cr = card.getBoundingClientRect();
        const note = node(src).querySelector(".sd-note-box").getBoundingClientRect();
        // 8px into the note along the line: what the reader sees there.
        const under = document.elementFromPoint(x, note.top + 8);
        out.push({ eid, startGap: Math.round(y - cr.bottom), noteBelowStart: note.top >= y - 1, coveredByNote: !!under?.closest(".sd-note-box") });
      }
      return out;
    });

    for (const r of probe) {
      expect(Math.abs(r.startGap), `${r.eid} starts on the card's bottom edge`).toBeLessThanOrEqual(2);
      expect(r.noteBelowStart, `${r.eid} note hangs below the start`).toBe(true);
      expect(r.coveredByNote, `${r.eid} note paints over the line`).toBe(true);
    }
  } finally {
    await api.patch(`/api/flows/${id}`, { headers: { Cookie: OWNER_COOKIE, "Content-Type": "application/json" }, data: { locked: false } }); // every flow starts delete-locked
    await api.delete(`/api/flows/${id}`, { headers: { Cookie: OWNER_COOKIE } });
    await api.delete(`/api/flows/${id}?purge=1`, { headers: { Cookie: OWNER_COOKIE } });
    await api.dispose();
  }
});
