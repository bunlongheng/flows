import { describe, it, expect } from "vitest";
import { cleanDrill } from "../../lib/clean-drill.js";
import { cleanNode } from "../../lib/clean-node.js";

const clean = (d) => cleanDrill(d, cleanNode);

describe("cleanDrill", () => {
  it("passes a valid drill through", () => {
    const out = clean({
      title: "  Orders DB  ",
      nodes: [
        { id: "orders", label: "orders", note: "id, user_id", x: 10.4, y: 20.6 },
        { id: "users", label: "users", position: { x: 300, y: 0 } },
      ],
      edges: [{ id: "fk1", source: "orders", target: "users", label: "user_id", style: { bs: "dashed", bogus: 1 } }],
      view: { panels: ["steps", "nope"] },
    });
    expect(out.title).toBe("Orders DB");
    expect(out.nodes[0]).toEqual({ id: "orders", position: { x: 10, y: 21 }, label: "orders", note: "id, user_id" });
    expect(out.nodes[1].position).toEqual({ x: 300, y: 0 });
    expect(out.edges).toEqual([{ id: "fk1", source: "orders", target: "users", label: "user_id", style: { bs: "dashed" } }]);
    expect(out.view).toEqual({ panels: ["steps"] });
  });

  it("enforces the caps", () => {
    const many = Array.from({ length: 101 }, (_, i) => ({ id: `n${i}` }));
    expect(clean({ nodes: many })).toBeNull();
    const two = [{ id: "a" }, { id: "b" }];
    expect(clean({ nodes: two, edges: Array.from({ length: 301 }, () => ({ source: "a", target: "b" })) })).toBeNull();
    const out = clean({ title: "x".repeat(200), nodes: [{ id: "a" }, { id: "a" }, { id: "y".repeat(61) }] });
    expect(out.title).toHaveLength(120);
    expect(out.nodes).toEqual([{ id: "a" }]);
  });

  it("drops a dangling edge and ids an unnamed one", () => {
    const out = clean({ nodes: [{ id: "a" }, { id: "b" }], edges: [{ source: "a", target: "zz" }, { source: "a", target: "b" }] });
    expect(out.edges).toEqual([{ id: "d2", source: "a", target: "b" }]);
  });

  it("strips a nested drill and a level", () => {
    const out = clean({ nodes: [{ id: "a", level: 2, drill: { nodes: [{ id: "deep" }] } }] });
    expect(out.nodes[0]).toEqual({ id: "a" });
  });

  it("returns null for junk", () => {
    for (const d of [null, undefined, "x", [], {}, { nodes: [] }, { nodes: [{}] }, { nodes: [{ id: "a" }], edges: "x" }]) {
      expect(clean(d)).toBeNull();
    }
  });

  it("rides on cleanNode", () => {
    expect(cleanNode({ id: "db", drill: { nodes: [{ id: "t" }] } }).drill).toEqual({ nodes: [{ id: "t" }], edges: [] });
    expect(cleanNode({ id: "db", drill: { nodes: [] } }).drill).toBeUndefined();
  });
});
