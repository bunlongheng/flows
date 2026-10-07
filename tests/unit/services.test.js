import { describe, it, expect } from "vitest";
import { SERVICES, findService, tagColor } from "../../src/services.js";

describe("findService", () => {
  // The owner's rule: a node's colour comes off its own icon, and an explicit
  // colour is an override nothing may overrule - not even a catalog id match.
  it("keeps a node's own colour when its id happens to match the catalog", () => {
    expect(findService({ id: "secretsmanager" }).color).toBe(SERVICES.secretsmanager.color);
    expect(findService({ id: "secretsmanager", color: "#ECD53F" }).color).toBe("#ECD53F");
    expect(findService({ id: "secretsmanager", color: "#ECD53F" }).icon).toBe(SERVICES.secretsmanager.icon);
    // A grey is not a choice, it is an agent guessing. The catalog keeps it.
    expect(findService({ id: "secretsmanager", color: "#9aa0a6" }).color).toBe(SERVICES.secretsmanager.color);
  });

  it("reads the colour off a bring-your-own icon when the node states none", () => {
    const yellow = "data:image/svg+xml;base64," + Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" fill="#ECD53F" viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>'
    ).toString("base64");
    expect(findService({ id: "env", icon: yellow }).color.toLowerCase()).toBe("#ecd53f");
    expect(findService({ id: "env", icon: yellow, color: "#0f766e" }).color).toBe("#0f766e");
  });

  it("resolves a known service id to its icon config", () => {
    const svc = findService({ id: "lambda" });
    expect(svc.label).toBe("Lambda");
    expect(svc.icon).toContain("lambda");
  });

  it("resolves a generic service to a real icon (never an emoji) by id", () => {
    const svc = findService({ id: "user" });
    expect(svc.label).toBe("User");
    expect(svc.icon).toContain("gen-user");
    expect(svc.emoji).toBeFalsy();
  });

  it("matches by label when the id is unknown", () => {
    const svc = findService({ id: "zzz", label: "DynamoDB" });
    expect(svc.icon).toContain("dynamodb");
  });

  it("draws the catalog logo for a catalog id even when the node carries a pasted icon", () => {
    // An agent passed a favicon URL for "integry"; the inlined 16x16 junk used
    // to beat the real /brand logo and the node came in grey with no logo.
    const svc = findService({ id: "integry", label: "Integry", icon: "data:image/png;base64,AAAA", color: "#9aa0a6" });
    expect(svc.icon).toBe("/brand/integry.png");
    expect(svc.color).toBe("#34A853");
  });

  it("returns an empty object for a fully unknown node", () => {
    expect(findService({ id: "zzzzz", label: "zzzzz" })).toEqual({});
  });
});

describe("tagColor", () => {
  it("is deterministic for a given tag", () => {
    expect(tagColor("API")).toEqual(tagColor("API"));
  });
  it("returns a palette entry with hex colors", () => {
    const c = tagColor("AWS");
    expect(c.bg).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(c.text).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});

describe("SERVICES catalog", () => {
  it("has the core AWS services with icons", () => {
    for (const key of ["lambda", "dynamo", "s3", "cloudfront", "apigw"]) {
      expect(SERVICES[key]).toBeTruthy();
    }
  });
});
