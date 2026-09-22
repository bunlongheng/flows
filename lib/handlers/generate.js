import Anthropic from "@anthropic-ai/sdk";
import db from "../db.js";
import { authorizeOwner, ownerId } from "../auth-owner.js";
import { uniqueFlowSlug } from "../slugs.js";
import { rateLimit } from "../rate-limit.js";
import { validateDesign, okColor } from "../validate-design.js";
import { arrangeNew } from "../arrange.js";

const APP_URL = process.env.FLOWS_APP_URL || "https://flows-bheng.vercel.app";

const SYSTEM = `You are an expert AWS architecture diagram generator.

Given a user prompt, return ONLY a valid JSON object - no markdown, no explanation - with:
{
  "title": "<concise diagram title, 3-6 words>",
  "nodes": [
    { "id": "<service_id>", "position": { "x": <number>, "y": <number> } }
  ],
  "edges": [
    { "id": "<edge_id>", "source": "<node_id>", "target": "<node_id>", "label": "<short label>", "color": "<hex color>", "animated": <true|false> }
  ]
}

CRITICAL rules for node IDs - use ONLY these exact IDs so icons resolve:
  People/Auth: user, client, oauth, auth
  Networking: cdn, cloudfront, loadbalancer, elb, nginx, zuul, gateway, apigw, route53, vpc
  Compute (AWS): lambda, ec2, ecs, eks, fargate, sfn, elasticbeanstalk, microservices, service, encoder
  Compute (GCP): cloudrun, gke, cloudfunctions
  Databases (AWS): dynamo, dynamostreams, aurora, cassandra, keyspaces, postgres, mysql, rds, mongodb, redshift
  Databases (GCP): cloudsql, firestore, spanner, bigquery
  Cache: redis, memcached, elasticache, memorystore
  Storage: s3, storage, cloudstorage
  Messaging (AWS): kafka, msk, sqs, sns, eventbridge, rabbitmq, kinesis
  Messaging (GCP): pubsub, cloudtasks
  Processing: flink, spark, ml, sagemaker, glue, athena, vertexai
  Observability: cloudwatch, cloudtrail, elasticsearch, opensearch, grafana, prometheus, cloudlogging, cloudmonitoring
  Security (AWS): kms, waf, shield, cognito, iam, secretsmanager, acm
  Security (GCP): cloudarmor, gcpiam
  CI/CD (AWS): codepipeline, codebuild, codedeploy, ecr, cloudformation, amplify, appsync, ses
  CI/CD (GCP): cloudbuild, clouddeploy, artifactregistry, cloudscheduler
  GCP Networking: cloudcdn, gcplb, clouddns, gcpgateway

Layout rules:
- Position nodes left-to-right in a logical flow
- Start x at 40, increment by ~220 per column
- Spread y positions with ~190 gap between rows
- Keep total width under 1400px, height under 800px
- Place related services vertically aligned
- User/client always on the far left

Edge colors - pick from: #3b82f6 #22c55e #f97316 #ef4444 #a855f7 #ec4899 #f59e0b #6366f1 #dc2626 #1d4ed8
Use animated: true for primary request flow, false for secondary connections.

Max 15 nodes, keep it clear and readable. Every node MUST use one of the listed IDs above.`;

// ADMIN-ONLY. The Bearer API secret is intentionally NOT accepted here
// (allowBearer:false): AI generation spends Anthropic credits, so only local
// dev or the logged-in owner may trigger it. Public callers use the render-only
// POST /api/ai/flows, which never calls Claude.
export default async function generate(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!(await authorizeOwner(req, { allowBearer: false }))) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Defense-in-depth: this route spends Anthropic credits, so cap it tightly
  // even for the authenticated owner.
  const limited = rateLimit(req, { key: "generate", limit: 10, windowMs: 60000 });
  if (!limited.ok) {
    res.setHeader("Retry-After", String(limited.retryAfter));
    return res.status(429).json({ error: "Rate limit exceeded" });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const { prompt } = body;
  if (!prompt?.trim()) return res.status(400).json({ error: "prompt is required" });
  if (typeof prompt !== "string" || prompt.length > 2000) return res.status(400).json({ error: "prompt must be a string of at most 2000 characters" });

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let title, nodes, edges, tokensOut = 0;
  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });
    const text = msg.content.find((b) => b.type === "text")?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    const parsed = JSON.parse(jsonMatch[0]);
    title = parsed.title;
    nodes = parsed.nodes;
    edges = parsed.edges ?? [];
    if (!title || !Array.isArray(nodes) || nodes.length === 0) throw new Error("Missing title or nodes");
    tokensOut = msg.usage?.output_tokens ?? 0;
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[ai/generate] generation error:", detail);
    const lower = detail.toLowerCase();
    if (e?.status === 402 || lower.includes("credit") || lower.includes("billing") || lower.includes("402")) {
      return res.status(402).json({ error: "AI generation is temporarily unavailable (billing)" });
    }
    return res.status(500).json({ error: "Diagram generation failed" });
  }

  // The model's output goes through the SAME gate as the API and the MCP. A
  // hallucinated service id used to be stored and drawn as a bare letter - the
  // one door where the product's hard rule did not apply.
  const invalid = validateDesign({ nodes, edges });
  if (invalid) {
    return res.status(422).json({ error: `The model produced an invalid diagram: ${invalid.error}`, ...(invalid.unresolved ? { unresolved: invalid.unresolved } : {}) });
  }
  // Same normalisation as the API: keep only the fields we store, then arrange.
  nodes = arrangeNew(nodes.map((nd) => ({
    id: nd.id,
    ...(nd.position && typeof nd.position.x === "number" && typeof nd.position.y === "number" ? { position: nd.position } : {}),
    ...(typeof nd.label === "string" && nd.label ? { label: nd.label } : {}),
    ...(okColor(nd.color) ? { color: nd.color } : {}),
  })), edges);

  const owner = ownerId();
  if (!owner) return res.status(500).json({ error: "OWNER_USER_ID not configured" });

  // Private by default (is_public=false) - /demo is auth-free, so an AI-generated
  // diagram must not appear there until the owner explicitly publishes it.
  const slug = await uniqueFlowSlug(owner, title);
  const { rows } = await db.query(
    "INSERT INTO flows (user_id, title, slug, nodes, edges, type, tags, tokens_out, is_public) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7::text[], $8, false) RETURNING id",
    [owner, title.trim(), slug, JSON.stringify(nodes), JSON.stringify(edges), "flows", ["AI"], tokensOut, false],
  );
  if (rows.length === 0) return res.status(500).json({ error: "Insert failed" });

  const id = rows[0].id;
  return res.status(201).json({ id, title, nodes, edges, url: `${APP_URL}/?id=${id}` });
}
