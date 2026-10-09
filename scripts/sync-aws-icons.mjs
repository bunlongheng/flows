// Every AWS icon in public/icons comes from https://aws-icons.com and nowhere
// else (owner rule, restated 2026-10-09: "ALWAYS hardgate use icons from this
// ONLY if AWS icons, they have the latest"). That site serves the official AWS
// Architecture artwork from icon.icepanel.io, and it tracks AWS's releases, so
// a hand-made or third-party stand-in is always wrong however close it looks.
//
//   node scripts/sync-aws-icons.mjs          report what differs
//   node scripts/sync-aws-icons.mjs --write  pull the current artwork in
//
// MAP is file in public/icons -> the aws-icons.com slug (its page is
// https://aws-icons.com/icons/<slug>). Adding an AWS icon means adding a line
// here and running this, never dropping a file in by hand.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "public/icons");

export const MAP = {
  "apigateway.svg": "api-gateway",
  "aurora.svg": "aurora",
  "aws-acm.svg": "certificate-manager",
  "aws-amplify.svg": "amplify",
  "aws-appsync.svg": "appsync",
  "aws-athena.svg": "athena",
  "aws-aurora.svg": "aurora",
  "aws-cloudformation.svg": "cloudformation",
  "aws-codebuild.svg": "codebuild",
  "aws-codedeploy.svg": "codedeploy",
  "aws-codepipeline.svg": "codepipeline",
  "aws-cognito.svg": "cognito",
  "aws-dynamodb-streams.svg": "dynamodb",
  "aws-ecr.svg": "elastic-container-registry",
  "aws-ecs.svg": "elastic-container-service",
  "aws-eks.svg": "elastic-kubernetes-service",
  "aws-elasticbeanstalk.svg": "elastic-beanstalk",
  "aws-fargate.svg": "fargate",
  "aws-glue.svg": "glue",
  "aws-iam.svg": "identity-and-access-management",
  "aws-kinesis.svg": "kinesis",
  "aws-redshift.svg": "redshift",
  "aws-route53.svg": "route-53",
  "aws-s3.svg": "simple-storage-service",
  "aws-secrets-manager.svg": "secrets-manager",
  "aws-ses.svg": "simple-email-service",
  "aws-shield.svg": "shield",
  "aws-transcribe.svg": "transcribe",
  "aws-vpc.svg": "virtual-private-cloud",
  "aws-waf.svg": "waf",
  "cloudfront.svg": "cloudfront",
  "cloudtrail.svg": "cloudtrail",
  "cloudwatch.svg": "cloudwatch",
  "dynamodb.svg": "dynamodb",
  "ec2.svg": "ec2",
  "elasticache.svg": "elasticache",
  "elb.svg": "elastic-load-balancing",
  "eventbridge.svg": "eventbridge",
  "kafka.svg": "managed-streaming-for-apache-kafka",
  "keyspaces.svg": "keyspaces",
  "kms.svg": "key-management-service",
  "lambda.svg": "lambda",
  "opensearch.svg": "opensearch-service",
  "rds.svg": "rds",
  "s3.svg": "simple-storage-service",
  "sagemaker.svg": "sagemaker",
  "sns.svg": "simple-notification-service",
  "sqs.svg": "simple-queue-service",
  "stepfunctions.svg": "step-functions",
};

// aws-icons.com has no page for these yet, so they stay on the artwork taken
// straight from the official AWS Architecture Icons package.
export const NOT_PUBLISHED = new Set(["aws-bedrock.svg"]);

async function svgFor(slug) {
  const page = await fetch(`https://aws-icons.com/icons/${slug}`).then((r) => r.text());
  const url = (page.match(/https:\/\/icon\.icepanel\.io\/AWS\/svg\/[^"']+\.svg/) || [])[0];
  if (!url) return null;
  const svg = await fetch(url).then((r) => r.text());
  return svg.startsWith("<?xml") || svg.startsWith("<svg") ? svg : null;
}

const write = process.argv.includes("--write");
let same = 0; const changed = [], missing = [];
for (const [file, slug] of Object.entries(MAP)) {
  const svg = await svgFor(slug);
  if (!svg) { missing.push(`${file} (${slug})`); continue; }
  const p = path.join(DIR, file);
  const old = existsSync(p) ? readFileSync(p, "utf8") : "";
  if (old === svg) { same++; continue; }
  changed.push(file);
  if (write) writeFileSync(p, svg);
}
console.log(`aws-icons.com: ${same} already current, ${changed.length} ${write ? "updated" : "differ"}${changed.length ? ": " + changed.join(", ") : ""}`);
if (missing.length) console.log(`no page on aws-icons.com: ${missing.join(", ")}`);
if (!write && changed.length) process.exitCode = 1;
