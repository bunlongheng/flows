import { test, expect, request } from "@playwright/test";
import { signSession } from "../../lib/auth-session.js";

// Two lines that land on the same pixel are one line as far as a reader is
// concerned - there is no way to tell which input is which. That happened two
// ways at once here:
//
//   1. detour() built its exit from the box CENTRE and threw away the slot
//      attachPoint had spread, so a detoured edge parked on top of whatever
//      legitimately owned the middle of that face.
//   2. every detour then took the NEAREST clear lane, so two of them arrived at
//      their own slots and travelled the whole way down the same line, labels
//      included.
//
// The fixture is the shape that showed it: a top row wired left to right, with
// codebuild and cloudwatch both reaching back down to user - a route that is
// blocked on every horizontal face, so both are forced to detour.
const SECRET = process.env.FLOWS_API_SECRET || "e2e-secret";
const OWNER_COOKIE = `sd_session=${signSession({ email: process.env.OWNER_EMAIL })}`;

test.use({ viewport: { width: 1600, height: 1100 } });

const DESIGN = {
  title: "E2E Edge Overlap",
  type: "flows",
  nodes: [
    { id: "gateway", position: { x: 0, y: 163 } },
    { id: "claude", position: { x: 310, y: 0 } },
    { id: "storage", position: { x: 626, y: 0 } },
    { id: "codebuild", position: { x: 951, y: -5 }, note: "Step 4 Hidden tests. lib/cache/fncache_test.go, package cache. TestFnCacheSanity and TestFnCacheCancellation call newFnCache and Get directly." },
    { id: "lambda", position: { x: 1277, y: 0 } },
    { id: "cloudwatch", position: { x: 1645, y: 0 } },
    { id: "user", position: { x: 310, y: 326 }, note: "Reviewer. Reads Steps 1 to 5 and answers 1 question: do the hidden tests reward what the prompt asks for." },
    { id: "jotform", position: { x: 626, y: 326 } },
    { id: "s3", position: { x: 1146, y: 676 } },
  ],
  edges: [
    { id: "e1", source: "gateway", target: "claude", label: "task" },
    { id: "e2", source: "claude", target: "storage", label: "writes patch" },
    { id: "e3", source: "storage", target: "codebuild", label: "compile and run" },
    { id: "e4", source: "s3", target: "codebuild", label: "tests written against gold" },
    { id: "e5", source: "codebuild", target: "lambda", label: "pass or fail" },
    { id: "e6", source: "lambda", target: "cloudwatch", label: "score and transcript" },
    { id: "e7", source: "gateway", target: "user", label: "read Step 2" },
    { id: "e8", source: "s3", target: "user", label: "read Step 3" },
    { id: "e9", source: "codebuild", target: "user", label: "read Step 4" },
    { id: "e10", source: "cloudwatch", target: "user", label: "read Step 5" },
    { id: "e11", source: "user", target: "jotform", label: "Step 6 label" },
  ],
};

test("two edges never share an endpoint, a lane or a label", async ({ page, baseURL }) => {
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
      const box = [...document.querySelectorAll(".react-flow__node")].map((n) => {
        const r = n.getBoundingClientRect();
        return { id: n.getAttribute("data-id"), l: r.left, t: r.top, r: r.right, b: r.bottom };
      });
      // Name an endpoint by the box it lands on, so only ends meeting at the
      // SAME box are compared - two edges passing near each other in open space
      // are just a crossing.
      const nearest = (x, y) => box
        .map((n) => ({ id: n.id, d: Math.hypot(Math.max(n.l - x, 0, x - n.r), Math.max(n.t - y, 0, y - n.b)) }))
        .sort((a, b) => a.d - b.d)[0].id;

      const paths = [...document.querySelectorAll(".react-flow__edge-path")].map((path) => {
        const len = path.getTotalLength();
        const m = path.ownerSVGElement.getScreenCTM();
        const at = (t) => {
          const q = path.getPointAtLength(t);
          return { x: q.x * m.a + q.y * m.c + m.e, y: q.x * m.b + q.y * m.d + m.f };
        };
        const pts = [];
        for (let t = 0; t <= len; t += 2) pts.push(at(t));
        return { id: path.parentElement?.getAttribute("data-id") || "?", pts, ends: [at(0), at(len)] };
      });

      const sameSpot = [];
      const sameLane = [];
      for (let i = 0; i < paths.length; i++) {
        for (let j = i + 1; j < paths.length; j++) {
          for (const a of paths[i].ends) {
            for (const b of paths[j].ends) {
              const d = Math.hypot(a.x - b.x, a.y - b.y);
              if (d < 10 && nearest(a.x, a.y) === nearest(b.x, b.y)) {
                sameSpot.push({ a: paths[i].id, b: paths[j].id, apart: Math.round(d) });
              }
            }
          }
          // A crossing puts ~16px of one line within 6px of the other. A shared
          // lane puts hundreds.
          let n = 0;
          for (const a of paths[i].pts) {
            if (paths[j].pts.some((c) => Math.abs(a.x - c.x) < 6 && Math.abs(a.y - c.y) < 6)) n += 2;
          }
          if (n > 60) sameLane.push({ a: paths[i].id, b: paths[j].id, overlapPx: n });
        }
      }

      const labels = [...document.querySelectorAll(".react-flow__edgelabel-renderer > *")]
        .map((e) => ({ text: e.textContent.trim().slice(0, 20), r: e.getBoundingClientRect() }))
        .filter((o) => o.r.width);
      const sameLabel = [];
      for (let i = 0; i < labels.length; i++) {
        for (let j = i + 1; j < labels.length; j++) {
          const a = labels[i].r, b = labels[j].r;
          if (Math.min(a.right, b.right) > Math.max(a.left, b.left)
            && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top)) {
            sameLabel.push({ a: labels[i].text, b: labels[j].text });
          }
        }
      }
      return { edges: paths.length, labels: labels.length, sameSpot, sameLane, sameLabel };
    });

    expect(probe.edges).toBe(11);
    expect(probe.labels).toBe(11);
    expect(probe.sameSpot).toEqual([]);
    expect(probe.sameLane).toEqual([]);
    expect(probe.sameLabel).toEqual([]);
  } finally {
    await api.patch(`/api/flows/${id}`, { headers: { Cookie: OWNER_COOKIE, "Content-Type": "application/json" }, data: { locked: false } }); // every flow starts delete-locked
    await api.delete(`/api/flows/${id}`, { headers: { Cookie: OWNER_COOKIE } });
    await api.delete(`/api/flows/${id}?purge=1`, { headers: { Cookie: OWNER_COOKIE } });
    await api.dispose();
  }
});
