import { test, expect, request } from "@playwright/test";
import { signSession } from "../../lib/auth-session.js";

// A note hangs below its card and React Flow never measures it, so the edge
// router used to treat the node as ending at the card. A line leaving the
// bottom face then ran BEHIND the opaque note box and re-emerged under it,
// which reads as a connector that dead-ends into a box. Ending the line flush
// ON the box's border is the same defect with one fewer pixel, so the assertion
// is clearance, not intersection.
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

test("no edge is drawn through a note box", async ({ page, baseURL }) => {
  const api = await request.newContext({ baseURL });
  const create = await api.post("/api/ai/flows", { headers: { Authorization: `Bearer ${SECRET}` }, data: DESIGN });
  expect(create.status()).toBe(201);
  const id = (await create.json()).url.split("/?id=")[1];

  try {
    await page.context().addCookies([{ name: "sd_session", value: OWNER_COOKIE.split("=")[1], domain: "localhost", path: "/" }]);
    await page.goto(`/?id=${id}`);
    await page.waitForSelector(".sd-note-box");
    await page.waitForTimeout(2500); // notes measure, then the edges re-route

    const probe = await page.evaluate((CLEAR) => {
      const notes = [...document.querySelectorAll(".sd-note-box")]
        .filter((b) => b.offsetHeight)
        .map((b) => b.getBoundingClientRect());
      const hits = [];
      for (const path of document.querySelectorAll(".react-flow__edge-path")) {
        const len = path.getTotalLength();
        const ctm = path.ownerSVGElement.getScreenCTM();
        for (let t = 0; t <= len; t += 2) {
          const p = path.getPointAtLength(t);
          const x = p.x * ctm.a + p.y * ctm.c + ctm.e;
          const y = p.x * ctm.b + p.y * ctm.d + ctm.f;
          // Tested OUTSIDE the border, not inside it: a line that starts exactly
          // on the note's bottom edge never enters the box and still reads as a
          // line running into it. CLEAR is the daylight the router must keep.
          if (notes.some((r) => x > r.left - CLEAR && x < r.right + CLEAR && y > r.top - CLEAR && y < r.bottom + CLEAR)) {
            hits.push({ x: Math.round(x), y: Math.round(y) });
            break;
          }
        }
      }
      return { noteBoxes: notes.length, hits };
    }, 5);

    expect(probe.noteBoxes).toBe(3);
    expect(probe.hits).toEqual([]);
  } finally {
    await api.delete(`/api/flows/${id}`, { headers: { Cookie: OWNER_COOKIE } });
    await api.delete(`/api/flows/${id}?purge=1`, { headers: { Cookie: OWNER_COOKIE } });
    await api.dispose();
  }
});
