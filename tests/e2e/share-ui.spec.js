import { test, expect, request } from "@playwright/test";
import { signSession } from "../../lib/auth-session.js";

// The share flow end to end, in a real browser, the way a person actually does
// it: open a PRIVATE diagram, hit Share, and end up with a link someone else can
// open that previews as a proper card.
//
// This is the spec that guards the whole chain - publish, the copied URL, the
// card image, and the meta tags a crawler reads. If any link in it breaks, the
// thing the user sees is a dead link or a generic grey card.
const SECRET = process.env.FLOWS_API_SECRET || "e2e-secret";
const OWNER_COOKIE = `sd_session=${signSession({ email: process.env.OWNER_EMAIL })}`;

test.use({ viewport: { width: 1440, height: 900 } });

// Next emits `content="x"/>` where the hand-built HTML emitted `content="x" />`.
// Assert on the VALUE rather than the framework's whitespace, so this spec is
// about the card being right, not about who rendered it.
const meta = (html, key) => {
  const m = new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`).exec(html);
  return m ? m[1] : null;
};

const DESIGN = {
  title: "E2E Share Flow",
  type: "flows",
  nodes: [
    { id: "user", position: { x: 40, y: 200 } },
    { id: "apigw", position: { x: 300, y: 200 } },
    { id: "lambda", position: { x: 560, y: 200 } },
    { id: "dynamo", position: { x: 820, y: 200 } },
  ],
  edges: [
    { id: "e1", source: "user", target: "apigw", label: "request" },
    { id: "e2", source: "apigw", target: "lambda", label: "invoke" },
    { id: "e3", source: "lambda", target: "dynamo", label: "read/write" },
  ],
};

test("Share on a private diagram publishes it, previews the card, and hands out a working link", async ({
  page,
  context,
  baseURL,
}) => {
  const api = await request.newContext({ baseURL });
  const create = await api.post("/api/ai/flows", {
    headers: { Authorization: `Bearer ${SECRET}` },
    data: DESIGN,
  });
  expect(create.status()).toBe(201);
  const id = (await create.json()).url.split("/?id=")[1];
  const row = await (await api.get(`/api/flows/${id}`, { headers: { Cookie: OWNER_COOKIE } })).json();
  const slug = row.slug;

  try {
    // Created private: a stranger cannot read it, and it previews as the generic
    // site card. That is the state the owner starts from.
    expect(row.is_public).toBe(false);
    expect((await api.get(`/api/flows/${id}`)).status()).toBe(404);

    await context.addCookies([{ name: "sd_session", value: OWNER_COOKIE.split("=")[1], url: baseURL }]);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto(`/?id=${id}`);
    await page.waitForSelector(".react-flow__node", { timeout: 15000 });

    // Open the share panel and hit Link, which is what publishes.
    await page.locator('button:has-text("Share")').first().click();
    await page.locator('button:has-text("Link")').first().click();
    await expect.poll(async () => (await api.get(`/api/flows/${id}`)).status(), { timeout: 10000 }).toBe(200);

    // 1. It is now readable by someone with no session at all.
    const pub = await (await api.get(`/api/flows/${id}`)).json();
    expect(pub.is_public).toBe(true);

    // 2. The clipboard holds the readable ?name= link on the public origin -
    //    never a localhost URL, which is useless to the person receiving it.
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain(`?name=${slug}`);
    expect(copied).not.toContain("localhost");
    // It MUST be the /demo route. Vercel resolves "/" from the filesystem before
    // rewrites run, so a link off "/" never reaches the share function and
    // previews as the generic site card.
    expect(copied).toContain(`/demo?name=${slug}`);

    // And that exact copied URL is the one that serves this design's own tags.
    // Asserted on the tags themselves - the x-sd-share header existed only to
    // tell the old share handler apart from a static index.html, and there is no
    // static shell any more: generateMetadata runs on every route.
    const served = await api.get(new URL(copied).pathname + new URL(copied).search);
    expect(meta(await served.text(), "og:title")).toBe(DESIGN.title);

    // 3. The panel shows the real card, not a broken image.
    const preview = page.locator('img[alt="Share card preview"]');
    await expect(preview).toBeVisible();
    await expect.poll(() => preview.evaluate((el) => el.naturalWidth), { timeout: 15000 }).toBe(1200);
    expect(await preview.evaluate((el) => el.naturalHeight)).toBe(630);

    // 4. What a crawler pulls from the shared URL: this design's own title and
    //    its own card, not the generic site one.
    const html = await (await api.get(`/demo?name=${slug}`)).text();
    expect(meta(html, "og:title")).toBe(DESIGN.title);
    expect(meta(html, "og:image")).toContain(`/api/og?name=${slug}`);
    expect(meta(html, "twitter:card")).toBe("summary_large_image");

    // 5. The card must be the DIAGRAM, not the generic site fallback. The panel
    //    asks for this card while the design is still private, and caching that
    //    302 meant a freshly shared link previewed as the generic card for the
    //    next five minutes - on exactly the share the user just made.
    const generic = (await api.get("/og.png")).body();
    //    HEAD too: several link-preview bots send it before GET, and it 405'd.
    expect((await api.fetch(`/api/og?name=${slug}`, { method: "HEAD" })).status()).toBe(200);

    // 6. And that card is a real 1200x630 PNG with the diagram drawn in it.
    const og = await api.get(`/api/og?name=${slug}`);
    expect(og.headers()["content-type"]).toBe("image/png");
    const buf = await og.body();
    expect(buf.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(buf.readUInt32BE(16)).toBe(1200);
    expect(buf.readUInt32BE(20)).toBe(630);
    // A card carrying 4 inlined service logos is far bigger than an empty frame;
    // this catches a card that renders as a blank rectangle.
    expect(buf.length).toBeGreaterThan(20000);
    expect(buf.length).not.toBe((await generic).length); // not the fallback
  } finally {
    await api.delete(`/api/flows/${id}`, { headers: { Cookie: OWNER_COOKIE } });
    await api.delete(`/api/flows/${id}?purge=1`, { headers: { Cookie: OWNER_COOKIE } });
    await api.dispose();
  }
});

// The regression that shipped: publishing a design removed it from the owner
// list (which returns only PRIVATE rows) without adding it to the public list
// (which returns only the 12 curated demos). The old ?name= resolver scanned
// those two lists, so a published non-demo design was in neither and its own
// share link 404'd - sharing a diagram broke the link sharing had just made.
test("a PUBLISHED non-demo design resolves by slug - sharing must not break its own link", async ({
  page,
  baseURL,
}) => {
  const api = await request.newContext({ baseURL });
  const create = await api.post("/api/ai/flows", {
    headers: { Authorization: `Bearer ${SECRET}` },
    data: { ...DESIGN, title: "E2E Published Not A Demo" },
  });
  const id = (await create.json()).url.split("/?id=")[1];
  const { slug } = await (await api.get(`/api/flows/${id}`, { headers: { Cookie: OWNER_COOKIE } })).json();

  try {
    await api.patch(`/api/flows/${id}`, {
      headers: { Cookie: OWNER_COOKIE, "Content-Type": "application/json" },
      data: { is_public: true },
    });

    // It is public, and it is NOT on the curated demo roster...
    const demos = await (await api.get("/api/flows/public")).json();
    expect(demos.some((d) => d.slug === slug)).toBe(false);
    // ...but it IS still in the owner's own list. It used to be excluded there too
    // (that list filtered on is_public = false), so publishing made a design
    // vanish from My Diagrams AND break its own share link. Both halves of that
    // are fixed; this asserts the half that keeps it visible to its owner.
    const mine = await (await api.get("/api/flows", { headers: { Cookie: OWNER_COOKIE } })).json();
    expect(mine.some((d) => d.slug === slug)).toBe(true);

    // It must STILL resolve by slug, for a stranger with no session.
    const bySlug = await api.get(`/api/flows/${slug}`);
    expect(bySlug.status()).toBe(200);
    expect((await bySlug.json()).id).toBe(id);

    // And the page itself must render the canvas, not "Design not found".
    await page.goto(`/?name=${slug}`);
    await page.waitForSelector(".react-flow__node", { timeout: 15000 });
    expect(await page.locator(".react-flow__node-awsNode").count()).toBe(DESIGN.nodes.length);
    await expect(page.locator("text=Design not found")).toHaveCount(0);
  } finally {
    await api.delete(`/api/flows/${id}`, { headers: { Cookie: OWNER_COOKIE } });
    await api.delete(`/api/flows/${id}?purge=1`, { headers: { Cookie: OWNER_COOKIE } });
    await api.dispose();
  }
});

test("a slug for a PRIVATE design stays hidden from a stranger", async ({ baseURL }) => {
  const api = await request.newContext({ baseURL });
  const create = await api.post("/api/ai/flows", {
    headers: { Authorization: `Bearer ${SECRET}` },
    data: { ...DESIGN, title: "E2E Private By Slug" },
  });
  const id = (await create.json()).url.split("/?id=")[1];
  const { slug } = await (await api.get(`/api/flows/${id}`, { headers: { Cookie: OWNER_COOKIE } })).json();
  try {
    // Never published - a slug must not become a way around the privacy check.
    expect((await api.get(`/api/flows/${slug}`)).status()).toBe(404);
    expect((await api.get(`/api/flows/${slug}`, { headers: { Cookie: OWNER_COOKIE } })).status()).toBe(200);
    // And a slug cannot be used to mutate anything.
    expect((await api.delete(`/api/flows/${slug}`, { headers: { Cookie: OWNER_COOKIE } })).status()).toBe(400);
  } finally {
    await api.delete(`/api/flows/${id}`, { headers: { Cookie: OWNER_COOKIE } });
    await api.delete(`/api/flows/${id}?purge=1`, { headers: { Cookie: OWNER_COOKIE } });
    await api.dispose();
  }
});

// Auto-placement keeps a step badge off its own node, but it cannot see the OTHER
// badges - on a dense diagram two still collide. The owner drags one clear, and
// that correction has to survive a reload or it is worthless.
test("a step badge slides ALONG its edge, persists, and double-click resets it", async ({ page, context, baseURL }) => {
  const api = await request.newContext({ baseURL });
  const create = await api.post("/api/ai/flows", {
    headers: { Authorization: `Bearer ${SECRET}` },
    data: { ...DESIGN, title: "E2E Badge Drag" },
  });
  const id = (await create.json()).url.split("/?id=")[1];

  try {
    await context.addCookies([{ name: "sd_session", value: OWNER_COOKIE.split("=")[1], url: baseURL }]);
    const open = async () => {
      await page.goto(`/?id=${id}`);
      await page.waitForSelector(".react-flow__node", { timeout: 15000 });
      await page.waitForSelector(".sd-edge-badge.is-movable", { timeout: 15000 });
    };
    const badge = () => page.locator(".sd-edge-badge").first();
    // Centre, not y: these edges are horizontal, so sliding ALONG one moves the
    // badge in x and leaves y almost unchanged.
    const at = async () => {
      const b = await badge().boundingBox();
      return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
    };
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

    await open();
    const before = await at();

    // Distance from the badge's centre to the nearest point on its own edge path.
    const distanceFromEdge = async () => {
      const b = await badge().boundingBox();
      return page.evaluate(({ cx, cy }) => {
        const p = document.querySelector(".react-flow__edge-path");
        const svg = p.ownerSVGElement;
        const pt = svg.createSVGPoint();
        // The badge box is in screen space; the path is in the flow's space.
        const m = p.getScreenCTM().inverse();
        pt.x = cx; pt.y = cy;
        const local = pt.matrixTransform(m);
        const len = p.getTotalLength();
        let best = Infinity;
        for (let i = 0; i <= 200; i++) {
          const q = p.getPointAtLength((i / 200) * len);
          best = Math.min(best, Math.hypot(q.x - local.x, q.y - local.y));
        }
        return best;
      }, { cx: b.x + b.width / 2, cy: b.y + b.height / 2 });
    };

    const box = await badge().boundingBox();
    const saved = page.waitForResponse((r) => r.request().method() === "PATCH" && r.status() === 200);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    // Drag hard AWAY from the line - the badge must refuse to leave it.
    await page.mouse.move(box.x + box.width / 2 + 260, box.y + box.height / 2 - 190, { steps: 14 });
    await page.mouse.up();
    await saved; // the move is only real once it is stored

    // It moved along the edge...
    expect(dist(await at(), before)).toBeGreaterThan(20);
    // ...but it is still sitting on its own edge, not out on open canvas -
    // the cursor was dragged 260px right and 190px up, far off the line.
    expect(await distanceFromEdge()).toBeLessThan(14);
    const moved = await at();

    // Survives a reload - the whole point.
    await open();
    expect(dist(await at(), moved)).toBeLessThan(10);
    expect(await distanceFromEdge()).toBeLessThan(14);

    // Double-click hands it back to the computed spot.
    const reset = page.waitForResponse((r) => r.request().method() === "PATCH" && r.status() === 200);
    await badge().dblclick();
    await reset;
    await open();
    expect(dist(await at(), before)).toBeLessThan(10);
  } finally {
    await api.delete(`/api/flows/${id}`, { headers: { Cookie: OWNER_COOKIE } });
    await api.delete(`/api/flows/${id}?purge=1`, { headers: { Cookie: OWNER_COOKIE } });
    await api.dispose();
  }
});

// The showcase is locked: a visitor sees the layout the owner set, and dragging
// a node pans the canvas instead of moving it.
test("a visitor cannot move a node on /demo and gets no edit, share or export controls", async ({ browser, baseURL }) => {
  const api = await request.newContext({ baseURL });
  const create = await api.post("/api/ai/flows", {
    headers: { Authorization: `Bearer ${SECRET}` },
    data: {
      title: "Locked demo check", is_public: true,
      nodes: [{ id: "user" }, { id: "apigw" }, { id: "lambda" }],
      edges: [{ source: "user", target: "apigw" }, { source: "apigw", target: "lambda" }],
    },
  });
  const id = (await create.json()).url.split("/?id=")[1];
  try {
    const row = await (await api.get(`/api/flows/${id}`)).json();
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); // no owner cookie
    const page = await ctx.newPage();
    await page.goto(`/demo?name=${row.slug}`);
    await page.waitForSelector(".react-flow__node", { timeout: 20000 });
    await page.waitForTimeout(600);

    const node = page.locator('.react-flow__node[data-id="user"]');
    const before = await node.evaluate((el) => el.style.transform);
    const box = await node.boundingBox();
    await page.mouse.move(box.x + 40, box.y + 30);
    await page.mouse.down();
    await page.mouse.move(box.x + 260, box.y + 190, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(600);
    expect(await node.evaluate((el) => el.style.transform)).toBe(before);

    for (const name of ["Arrange", "Share", "Code"]) {
      await expect(page.locator(`header button:has-text("${name}")`)).toHaveCount(0);
    }
    await expect(page.locator(".sd-share-panel")).toHaveCount(0);
    // No view controls either: the slim share header carries 1 download and nothing else.
    await expect(page.locator(".sd-detail-actions")).toHaveCount(0);
    await expect(page.locator("header.sd-share-header")).toHaveCount(1);
    await expect(page.locator('header button:has-text("Download PNG")')).toHaveCount(1);
    await expect(page.locator('header a[href="/demo"]')).toHaveCount(1);
    await ctx.close();
  } finally {
    await api.delete(`/api/flows/${id}`, { headers: { cookie: OWNER_COOKIE } });
  }
});

// Phone real estate: the summary card starts folded so the diagram gets the
// whole screen, and the badge opens it on demand.
test("the info card starts folded on a phone and the badge opens it", async ({ browser, baseURL }) => {
  const api = await request.newContext({ baseURL });
  const create = await api.post("/api/ai/flows", {
    headers: { Authorization: `Bearer ${SECRET}` },
    data: {
      title: "Info card fold check", is_public: true,
      pattern: "Read-heavy KV lookup: cache-first redirects",
      description: "A long URL is shortened to a Base62 key; lookups redirect from a hot cache.",
      nodes: [{ id: "user" }, { id: "apigw" }, { id: "dynamo" }],
      edges: [{ source: "user", target: "apigw" }, { source: "apigw", target: "dynamo" }],
    },
  });
  expect(create.status()).toBe(201);
  const id = (await create.json()).url.split("/?id=")[1];
  try {
    const row = await (await api.get(`/api/flows/${id}`)).json();
    expect(row.pattern).toContain("Read-heavy");
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(`/demo?name=${row.slug}`);
    await page.waitForSelector(".react-flow__node", { timeout: 20000 });
    await page.waitForTimeout(600);

    // Folded from the first frame on a phone: a small badge, no card.
    await expect(page.locator(".sd-info-card")).toHaveCount(0);
    const badge = page.locator(".sd-info-badge");
    const box = await badge.boundingBox();
    expect(box.width).toBeLessThanOrEqual(40);
    expect(box.height).toBeLessThanOrEqual(40);

    await badge.click();
    const card = page.locator(".sd-info-card");
    await expect(card).toHaveCount(1);
    expect((await card.boundingBox()).height).toBeGreaterThan(box.height * 2);
    await expect(card).toContainText("Read-heavy");

    await card.click();
    await expect(page.locator(".sd-info-card")).toHaveCount(0);
    await expect(page.locator(".sd-info-badge")).toHaveCount(1);
    await ctx.close();
  } finally {
    await api.delete(`/api/flows/${id}`, { headers: { cookie: OWNER_COOKIE } });
  }
});

// Phone chrome for the owner: the 2 marks at the start of the bar are one pair,
// the actions are finger-sized, and the app mark lines up with the content
// below it. (A visitor gets the slim share header, which has none of this.)
test("phone header: matched tiles, finger-sized targets, aligned app logo", async ({ browser, baseURL }) => {
  const api = await request.newContext({ baseURL });
  const create = await api.post("/api/ai/flows", {
    headers: { Authorization: `Bearer ${SECRET}` },
    // "Bitly" is in the brand map, so the title carries a brand tile.
    data: { title: "Bitly", is_public: true, nodes: [{ id: "user" }, { id: "apigw" }], edges: [{ source: "user", target: "apigw" }] },
  });
  const id = (await create.json()).url.split("/?id=")[1];
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addCookies([{ name: "sd_session", value: OWNER_COOKIE.split("=")[1], url: baseURL }]);
    const page = await ctx.newPage();

    await page.goto(`/?id=${id}`);
    await page.waitForSelector(".react-flow__node", { timeout: 20000 });
    await page.waitForTimeout(500);

    const box = (sel) => page.locator(sel).first().boundingBox();
    const back = await box('header button[aria-label="Back to gallery"]');
    const tile = await box("header .sd-brand-tile");
    expect(Math.round(tile.width)).toBe(Math.round(back.width));
    expect(Math.round(tile.height)).toBe(Math.round(back.height));
    expect(back.height).toBeGreaterThanOrEqual(44);

    // Every action left in the toolbar is a real target.
    const actions = await page.locator("header .sd-detail-actions button").evaluateAll((els) =>
      els.map((e) => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height }; }).filter((r) => r.w > 0));
    expect(actions.length).toBeGreaterThanOrEqual(3);
    for (const a of actions) expect(a.h).toBeGreaterThanOrEqual(38);

    // The header must not scroll sideways once everything grew.
    expect(await page.locator("header").first().evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);

    // A divider only earns its place between 2 controls that are both still
    // there. On a phone most of the bar is hidden, so what must never happen is
    // a bar left hanging at an end, or 2 of them stacked where the button
    // between them dropped out.
    const strays = await page.locator("header .sd-detail-actions > *").evaluateAll((els) => {
      const shown = els.filter((e) => e.getBoundingClientRect().width > 0);
      const isBar = (e) => e.classList.contains("sd-divider");
      return shown.filter((e, i) =>
        isBar(e) && (i === 0 || i === shown.length - 1 || isBar(shown[i - 1]) || isBar(shown[i + 1]))).length;
    });
    expect(strays).toBe(0);

    // The gallery app mark shares the 16px gutter with the content below it.
    await page.goto("/demo");
    await page.waitForSelector(".sd-app-logo", { timeout: 20000 });
    const logo = await box(".sd-app-logo");
    expect(Math.round(logo.width)).toBe(40);
    expect(Math.round(logo.x)).toBe(16);
    const mainPadLeft = await page.locator(".sd-main").evaluate((e) => parseFloat(getComputedStyle(e).paddingLeft));
    expect(Math.round(logo.x)).toBe(Math.round(mainPadLeft));
    await ctx.close();
  } finally {
    await api.delete(`/api/flows/${id}`, { headers: { cookie: OWNER_COOKIE } });
  }
});

// Fit is the only way back to the fitted view after pinching around, so it has
// to survive on a phone. Nothing may be clipped out of reach either.
// It builds its own diagram: a fresh CI database has none of the curated demos.
// Only the owner has Fit now; a visitor gets the diagram already fitted.
test("phone keeps Fit reachable and never hides a button out of reach", async ({ browser, baseURL }) => {
  const api = await request.newContext({ baseURL });
  const create = await api.post("/api/ai/flows", {
    headers: { Authorization: `Bearer ${SECRET}` },
    data: {
      title: "Phone fit button check", is_public: true,
      nodes: ["user", "cloudfront", "apigw", "lambda", "dynamo"].map((id) => ({ id })),
      edges: [["user", "cloudfront"], ["cloudfront", "apigw"], ["apigw", "lambda"], ["lambda", "dynamo"]].map(([source, target]) => ({ source, target })),
    },
  });
  expect(create.status()).toBe(201);
  const id = (await create.json()).url.split("/?id=")[1];
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addCookies([{ name: "sd_session", value: OWNER_COOKIE.split("=")[1], url: baseURL }]);
    const page = await ctx.newPage();
    await page.goto(`/?id=${id}`);
    await page.waitForSelector(".react-flow__node", { timeout: 20000 });
    await page.waitForTimeout(600);

    await expect(page.locator('header button:has-text("Fit")')).toHaveCount(1);
    // Overflow may exist on a tiny screen, but it must always be scrollable.
    expect(await page.locator("header").first().evaluate((e) => getComputedStyle(e).overflowX)).not.toBe("hidden");

    // Pinching away and pressing Fit returns to a fitted view.
    const scale = () => page.locator(".react-flow__viewport").evaluate((el) => Number((/scale\(([\d.]+)\)/.exec(el.style.transform) || [])[1]));
    const fitted = await scale();
    await page.mouse.move(195, 400);
    await page.mouse.wheel(0, -600);
    await page.waitForTimeout(500);
    expect(await scale()).not.toBe(fitted);
    await page.locator('header button:has-text("Fit")').click();
    await page.waitForTimeout(700);
    expect(Math.abs((await scale()) - fitted)).toBeLessThan(0.05);
    await ctx.close();
  } finally {
    await api.delete(`/api/flows/${id}`, { headers: { cookie: OWNER_COOKIE } });
  }
});

// The owner's bar is the widest the toolbar ever gets - 13 controls. It used to
// measure 1109px and scroll sideways on anything narrower: a phone held
// sideways, an iPad in Split View, a Duo pane. A toolbar that scrolls hides its
// own buttons, so at every width the bar has to fit, dropping the actions that
// have another way in rather than running off the edge.
test("the owner toolbar fits every viewport instead of scrolling sideways", async ({ browser, baseURL }) => {
  const api = await request.newContext({ baseURL });
  const create = await api.post("/api/ai/flows", {
    headers: { Authorization: `Bearer ${SECRET}` },
    data: {
      title: "Toolbar width check", is_public: true,
      nodes: ["user", "apigw", "lambda", "dynamo"].map((id) => ({ id })),
      edges: [["user", "apigw"], ["apigw", "lambda"], ["lambda", "dynamo"]].map(([source, target]) => ({ source, target })),
    },
  });
  expect(create.status()).toBe(201);
  const id = (await create.json()).url.split("/?id=")[1];
  try {
    // 320 an SE1 or a Slide Over pane, 390 a phone upright, 430 a Pro Max,
    // 667/844 the same phones turned sideways, 1024 an iPad, 1440 a laptop.
    for (const width of [320, 375, 390, 430, 667, 844, 1024, 1120, 1440]) {
      const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 500 } });
      await ctx.addCookies([{ name: "sd_session", value: OWNER_COOKIE.split("=")[1], url: baseURL }]);
      const page = await ctx.newPage();
      await page.goto(`/?id=${id}`);
      await page.waitForSelector(".react-flow__node", { timeout: 20000 });
      await page.waitForTimeout(400);

      const bar = page.locator("header.sd-detail-header").first();
      const over = await bar.evaluate((e) => e.scrollWidth - e.clientWidth);
      expect(over, `header overflows by ${over}px at ${width}px`).toBeLessThanOrEqual(0);

      // Fitting must not mean an empty bar: reading a diagram still takes Fit,
      // Steps and Notes at every single width.
      for (const name of ["Fit", "Steps", "Notes"]) {
        const btn = page.locator(`header button[title*="${name}" i], header button:has-text("${name}")`).first();
        expect(await btn.evaluate((e) => e.getBoundingClientRect().width > 0), `${name} missing at ${width}px`).toBe(true);
      }
      await ctx.close();
    }
  } finally {
    await api.delete(`/api/flows/${id}`, { headers: { cookie: OWNER_COOKIE } });
  }
});
