import { describe, it, expect } from "vitest";
import { layoutElements } from "../../src/layout.js";

// A node card is ~150x100 inside a 190x120 slot. Two nodes "overlap" if their
// boxes intersect at all - the bug this guards was an EXACT overlap (a DynamoDB
// sitting on top of a Microservices node), which makes a diagram unreadable.
const NODE_W = 190;
const NODE_H = 120;

const mk = (ids, pairs) => [
  ids.map(id => ({ id, type: "awsNode", data: { id } })),
  pairs.map(([source, target], i) => ({ id: `e${i}`, source, target })),
];

// Shapes that cover the ways Arrange can go wrong: a plain chain, a chain long
// enough to wrap, one node serving many leaves, several tuckable services on one
// parent (the overlap case), and a graph that is nothing but tuckables.
const GRAPHS = {
  "small chain": mk(["user", "cloudfront", "lambda", "dynamo"], [["user", "cloudfront"], ["cloudfront", "lambda"], ["lambda", "dynamo"]]),
  "long chain": mk(
    ["user", "apigw", "lambda", "sfn", "microservices", "kafka", "encoder", "s3", "cloudfront", "client"],
    [["user", "apigw"], ["apigw", "lambda"], ["lambda", "sfn"], ["sfn", "microservices"], ["microservices", "kafka"], ["kafka", "encoder"], ["encoder", "s3"], ["s3", "cloudfront"], ["cloudfront", "client"]],
  ),
  "wide fan-out": mk(
    ["user", "apigw", "lambda", "dynamo", "redis", "s3", "kafka", "sqs", "cloudwatch"],
    [["user", "apigw"], ["apigw", "lambda"], ["lambda", "dynamo"], ["lambda", "redis"], ["lambda", "s3"], ["lambda", "kafka"], ["lambda", "sqs"], ["lambda", "cloudwatch"]],
  ),
  "many tuckables on one parent": mk(
    ["user", "sqs", "microservices", "cloudwatch", "postgres", "dynamo", "redis", "s3", "cloudfront", "auth", "apigw"],
    [["user", "sqs"], ["sqs", "microservices"], ["microservices", "cloudwatch"], ["microservices", "postgres"], ["microservices", "dynamo"], ["microservices", "redis"], ["microservices", "s3"], ["s3", "cloudfront"], ["microservices", "auth"], ["microservices", "apigw"]],
  ),
  "everything is tuckable": mk(
    ["microservices", "dynamo", "redis", "s3", "postgres", "cloudwatch"],
    [["microservices", "dynamo"], ["microservices", "redis"], ["microservices", "s3"], ["microservices", "postgres"], ["microservices", "cloudwatch"]],
  ),
  "two hubs": mk(
    ["user", "apigw", "lambda", "dynamo", "microservices", "postgres", "kafka", "s3"],
    [["user", "apigw"], ["apigw", "lambda"], ["lambda", "dynamo"], ["lambda", "microservices"], ["microservices", "postgres"], ["microservices", "kafka"], ["kafka", "s3"]],
  ),
};

const overlaps = nodes => {
  const hits = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i].position;
      const b = nodes[j].position;
      if (Math.abs(a.x - b.x) < NODE_W && Math.abs(a.y - b.y) < NODE_H) hits.push(`${nodes[i].id} / ${nodes[j].id}`);
    }
  }
  return hits;
};

describe("layoutElements", () => {
  for (const [name, [nodes, edges]] of Object.entries(GRAPHS)) {
    it(`lays out "${name}" with no overlapping nodes`, () => {
      const out = layoutElements(nodes, edges, { canvas: { width: 1440, height: 800 } });
      expect(out).toHaveLength(nodes.length);
      expect(overlaps(out)).toEqual([]);
    });
  }

  it("keeps every node, tucked ones included", () => {
    const [nodes, edges] = GRAPHS["many tuckables on one parent"];
    const out = layoutElements(nodes, edges);
    expect(out.map(n => n.id).sort()).toEqual(nodes.map(n => n.id).sort());
  });

  it("is stable - arranging an arranged layout does not move anything", () => {
    const [nodes, edges] = GRAPHS["many tuckables on one parent"];
    const once = layoutElements(nodes, edges, { canvas: { width: 1440, height: 800 } });
    const twice = layoutElements(once, edges, { canvas: { width: 1440, height: 800 } });
    const at = ns => Object.fromEntries(ns.map(n => [n.id, `${Math.round(n.position.x)},${Math.round(n.position.y)}`]));
    expect(at(twice)).toEqual(at(once));
  });

  it("puts the data layer below the flow and the config layer above it", () => {
    const [nodes, edges] = mk(
      ["user", "microservices", "postgres", "cloudwatch", "apigw"],
      [["user", "microservices"], ["microservices", "postgres"], ["microservices", "cloudwatch"], ["microservices", "apigw"]],
    );
    const out = layoutElements(nodes, edges, { canvas: { width: 1440, height: 800 } });
    const y = id => out.find(n => n.id === id).position.y;
    expect(y("postgres")).toBeGreaterThan(y("microservices")); // database sits below
    expect(y("cloudwatch")).toBeLessThan(y("microservices")); // monitoring sits above
  });

  it("keeps a wide chain inside the width budget by going down instead of right", () => {
    const [nodes, edges] = GRAPHS["long chain"];
    const out = layoutElements(nodes, edges, { canvas: { width: 1440, height: 800 } });
    const width = Math.max(...out.map(n => n.position.x)) - Math.min(...out.map(n => n.position.x)) + NODE_W;
    expect(width).toBeLessThan(1440);
  });
});

describe("layoutElements column alignment", () => {
  it("centers boxes of different widths on the same axis, so connectors run straight", () => {
    // A vertical chain of 3 nodes whose rendered widths differ - the case where
    // left-aligning them put a slant on every connector.
    // Plain ids (none match the db/cdn/etc tuck patterns) so tuckables() leaves
    // the whole chain in the flow - this test is about center alignment, not
    // the tuck-a-leaf-under-its-parent path.
    const sized = (id, w) => ({ id, type: "awsNode", data: { id }, measured: { width: w, height: 118 } });
    const nodes = [sized("alpha", 205), sized("beta", 150), sized("gamma", 132)];
    const edges = [
      { id: "e0", source: "alpha", target: "beta" },
      { id: "e1", source: "beta", target: "gamma" },
    ];
    // Narrow and tall so the 3-node chain reliably wraps into one vertical
    // column (wrapIntoBands picks whichever banding scales biggest on screen) -
    // a wide canvas can instead put two of the three side by side, which is a
    // different, unrelated shape this test is not about.
    const out = layoutElements(nodes, edges, { canvas: { width: 400, height: 2000 } });
    const centerX = id => {
      const n = out.find(x => x.id === id);
      return n.position.x + n.measured.width / 2;
    };
    // Every node in the chain shares a center, whatever its width.
    expect(centerX("beta")).toBeCloseTo(centerX("alpha"), 5);
    expect(centerX("gamma")).toBeCloseTo(centerX("alpha"), 5);
  });
});

describe("layoutElements straightness", () => {
  // The look we want from Arrange: as many connectors as possible running dead
  // straight, because an aligned pair draws as one line instead of an elbow.
  // Dagre lines chains up and the step-order re-slot used to pull them apart -
  // this guards the pass that puts them back.
  const CHAIN = {
    nodes: ["user", "tailscale", "linode", "nginx", "pm2", "nextjs", "engine", "postgres", "telegram", "alpaca"],
    edges: [
      ["user", "tailscale"], ["tailscale", "nginx"], ["linode", "nginx"], ["nginx", "nextjs"],
      ["pm2", "nextjs"], ["pm2", "engine"], ["nextjs", "postgres"], ["engine", "postgres"],
      ["engine", "alpaca"], ["engine", "telegram"], ["alpaca", "postgres"], ["user", "telegram"],
    ],
  };

  it("aligns most connected pairs onto a shared row or column", () => {
    const nodes = CHAIN.nodes.map(id => ({ id, type: "awsNode", data: { id }, measured: { width: 150, height: 113 } }));
    const edges = CHAIN.edges.map(([source, target], i) => ({ id: `e${i}`, source, target }));
    const out = layoutElements(nodes, edges, { canvas: { width: 1440, height: 820 } });

    const c = Object.fromEntries(out.map(n => [n.id, {
      x: n.position.x + n.measured.width / 2,
      y: n.position.y + n.measured.height / 2,
    }]));
    const straight = CHAIN.edges.filter(([s, t]) =>
      Math.abs(c[s].x - c[t].x) < 2 || Math.abs(c[s].y - c[t].y) < 2).length;

    // Was 1 of 12 before the straighten pass.
    expect(straight).toBeGreaterThanOrEqual(6);
    expect(overlaps(out)).toEqual([]);
  });
});
