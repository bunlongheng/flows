import { test, expect } from "@playwright/test";
import { signSession } from "../../lib/auth-session.js";

// End-to-end against a PRODUCTION build (npm run build && npm run start), the
// same handlers Vercel runs. Proves the public contract + the auth policy.
const SECRET = process.env.FLOWS_API_SECRET || "e2e-secret";
const OWNER_COOKIE = `sd_session=${signSession({ email: process.env.OWNER_EMAIL })}`;

const VALID_BODY = {
  title: "E2E Uber System Design",
  type: "flows",
  nodes: [
    { id: "user", position: { x: 40, y: 200 } },
    { id: "apigw", position: { x: 260, y: 200 } },
    { id: "lambda", position: { x: 480, y: 200 } },
    { id: "dynamo", position: { x: 700, y: 200 } },
  ],
  edges: [
    { id: "e1", source: "user", target: "apigw", label: "req" },
    { id: "e2", source: "apigw", target: "lambda", label: "invoke" },
    { id: "e3", source: "lambda", target: "dynamo", label: "rw" },
  ],
};

test("GET /api/health -> 200 ok:true", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.ok).toBe(true);
  expect(body.checks.database).toBe(true);
});

test("POST /api/ai/flows with a BAD token -> 401 (no row created)", async ({ request }) => {
  const res = await request.post("/api/ai/flows", {
    headers: { Authorization: "Bearer not-the-real-token" },
    data: VALID_BODY,
  });
  expect(res.status()).toBe(401);
});

test("POST /api/ai/flows with a bad body -> 400 + sample_request", async ({ request }) => {
  const res = await request.post("/api/ai/flows", {
    headers: { Authorization: `Bearer ${SECRET}` },
    data: { title: "no nodes" },
  });
  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body.sample_request).toBeTruthy();
});

test("POST /api/ai/generate with a VALID public Bearer -> 401 (admin-only)", async ({ request }) => {
  const res = await request.post("/api/ai/generate", {
    headers: { Authorization: `Bearer ${SECRET}` },
    data: { prompt: "design uber" },
  });
  expect(res.status()).toBe(401);
});

test("public round-trip: create -> 201 {url} -> GET renders -> DELETE", async ({ request }) => {
  const create = await request.post("/api/ai/flows", {
    headers: { Authorization: `Bearer ${SECRET}` },
    data: VALID_BODY,
  });
  expect(create.status()).toBe(201);
  const { url } = await create.json();
  expect(url).toContain("/?id=");
  const id = url.split("/?id=")[1];

  // New diagrams are private by default; publish it so the unauthenticated read
  // below can see it (mirrors the owner flipping a diagram public).
  const pub = await request.patch(`/api/flows/${id}`, {
    headers: { Cookie: OWNER_COOKIE, "Content-Type": "application/json" },
    data: { is_public: true },
  });
  expect(pub.status()).toBe(200);

  const got = await request.get(`/api/flows/${id}`);
  expect(got.status()).toBe(200);
  const design = await got.json();
  expect(design.title).toBe(VALID_BODY.title);
  expect(design.nodes.length).toBe(VALID_BODY.nodes.length);

  // Clean up the test artifact (owner-session-gated DELETE).
  const del = await request.delete(`/api/flows/${id}`, {
    headers: { Cookie: OWNER_COOKIE },
  });
  expect(del.status()).toBe(200);
  expect((await del.json()).deleted).toBe(true);
  // Delete is soft - purge so the suite does not leave a row in trash each run.
  await request.delete(`/api/flows/${id}?purge=1`, {
    headers: { Cookie: OWNER_COOKIE },
  });
});
