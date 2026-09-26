import { describe, it, expect } from "vitest";
import handler from "../../lib/handlers/list-services.js";
import { SERVICES } from "../../src/services.js";

function mockRes() {
  return {
    statusCode: 0, body: null, headers: {},
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    setHeader(k, v) { this.headers[k] = v; },
  };
}

describe("GET /api/services", () => {
  it("lists every catalog id with its label and sub, cacheable", () => {
    const res = mockRes();
    handler({ method: "GET" }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.count).toBe(Object.keys(SERVICES).length);
    expect(res.body.services.find(s => s.id === "lambda")).toEqual({ id: "lambda", label: "Lambda", sub: SERVICES.lambda.sub });
    expect(res.body.services.some(s => "icon" in s)).toBe(false);
    expect(res.headers["Cache-Control"]).toMatch(/max-age/);
  });
  it("refuses POST", () => {
    const res = mockRes();
    handler({ method: "POST" }, res);
    expect(res.statusCode).toBe(405);
  });
});
