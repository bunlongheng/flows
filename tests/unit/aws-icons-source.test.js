// The hard gate on AWS artwork (owner rule, restated 2026-10-09: "ALWAYS
// hardgate use icons from this ONLY if AWS icons, they have the latest").
// Every AWS Architecture icon this app ships has to be the file
// https://aws-icons.com serves for that service, pulled by
// scripts/sync-aws-icons.mjs. A hand-made or third-party stand-in looked close
// enough to survive 2 passes and still drew DynamoDB magenta instead of blue.
//
// This test does not hit the network. It checks the 2 things that go wrong
// offline: an AWS icon file nobody mapped to a source, and a file whose own
// embedded title names a different service than its name says.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { MAP, NOT_PUBLISHED } from "../../scripts/sync-aws-icons.mjs";
import { SERVICES } from "../../src/services.js";

const DIR = path.join(process.cwd(), "public/icons");
const read = (f) => readFileSync(path.join(DIR, f), "utf8");
// The official artwork says so in its own title: Icon-Architecture/64/Arch_<Service>_64.
const isAws = (svg) => /Icon-Architecture|Arch_/.test(svg);
// The <title> element is the authoritative one: a few files also carry an id
// attribute whose spelling differs by a stray hyphen.
const titleOf = (svg) =>
  (((svg.match(/<title>[^<]*Arch_([^<_]+?)_\d+/) ||
     svg.match(/Arch_([A-Za-z0-9 -]+?)_\d+/) || [])[1]) || "").trim();

const files = readdirSync(DIR).filter((f) => f.endsWith(".svg"));

describe("AWS icons come from aws-icons.com and nowhere else", () => {
  const aws = files.filter((f) => isAws(read(f)));

  it("has AWS Architecture icons to gate", () => {
    expect(aws.length).toBeGreaterThan(40);
  });

  it("maps every AWS icon file to an aws-icons.com slug", () => {
    // A file in neither place is artwork from an unknown source: the exact
    // hole the magenta DynamoDB came through.
    const ungated = aws.filter((f) => !MAP[f] && !NOT_PUBLISHED.has(f));
    expect(ungated).toEqual([]);
  });

  it("maps nothing that is not on disk, and nothing twice over", () => {
    for (const f of Object.keys(MAP)) expect(files).toContain(f);
    for (const f of NOT_PUBLISHED) expect(files).toContain(f);
    expect(Object.keys(MAP).filter((f) => NOT_PUBLISHED.has(f))).toEqual([]);
  });

  it("draws the service its filename claims", () => {
    // The file's own title is the check: dynamodb.svg has to say DynamoDB.
    // A few are deliberate stand-ins (a service with no icon of its own
    // borrows its parent's), named here rather than silently let by.
    // AWS's own titles are not consistent across the set: Simple Queue Service
    // is titled AWS-, OpenSearch still carries its Elasticsearch-era title,
    // API Gateway ships a leading hyphen. These are the authoritative files, so
    // the title each one ships IS the expectation.
    const BORROWS = {
      "aws-dynamodb-streams.svg": "Amazon-DynamoDB",
      "s3.svg": "Amazon-Simple-Storage-Service",
      "aws-s3.svg": "Amazon-Simple-Storage-Service",
      "elb.svg": "Elastic-Load-Balancing",
      "kafka.svg": "Amazon-Managed-Streaming-for-Kafka",
      "kms.svg": "AWS-Key-Management-Services",
      "opensearch.svg": "Amazon-Elasticsearch-Service",
      "stepfunctions.svg": "AWS-Step-Functions",
      "apigateway.svg": "Amazon-API-Gateway",
      "aws-acm.svg": "AWS-Certificate-Manager",
      "aws-ecr.svg": "Amazon-Elastic-Container-Registry",
      "aws-ecs.svg": "Amazon-Elastic-Container-Service",
      "aws-eks.svg": "Amazon-Elastic-Container-Kubernetes",
      "aws-elasticbeanstalk.svg": "AWS-Elastic-Beanstalk",
      "aws-iam.svg": "AWS-Identity-and-Access-Management",
      "aws-route53.svg": "Amazon-Route-53",
      "aws-secrets-manager.svg": "AWS-Secrets-Manager",
      "aws-ses.svg": "Amazon-Simple-Email-Service",
      "aws-vpc.svg": "Amazon-Virtual-Private-Cloud",
      "sns.svg": "AWS-Simple-Notification-Service",
      "sqs.svg": "AWS-Simple-Queue-Service",
    };
    const wrong = [];
    for (const f of Object.keys(MAP)) {
      const title = titleOf(read(f));
      const want = BORROWS[f];
      if (want) {
        if (title !== want) wrong.push(`${f}: ${title} (expected ${want})`);
        continue;
      }
      // Otherwise the filename's letters have to appear in the title: lambda.svg -> AWS-Lambda.
      const stem = f.replace(/^aws-/, "").replace(/\.svg$/, "").replace(/-/g, "");
      if (!title.toLowerCase().replace(/-/g, "").includes(stem)) wrong.push(`${f}: ${title}`);
    }
    expect(wrong).toEqual([]);
  });
});

// The other half of the rule: an AWS logo may only stand for an AWS service.
// The catalog used to draw PostgreSQL and MySQL as Amazon RDS, Cassandra as
// Amazon Keyspaces, Elasticsearch as Amazon OpenSearch Service and Apache
// Kafka as Amazon MSK, which put an AWS mark on 44 cards across 28 diagrams
// that run none of those services.
describe("an AWS logo stands for an AWS service and nothing else", () => {
  // Products with a vendor of their own. The managed AWS wrapper keeps its own
  // key (rds, keyspaces, opensearch, msk, elasticache), so both can be drawn.
  const PRODUCTS = [
    "postgres", "mysql", "cassandra", "elasticsearch", "kafka",
    "mongodb", "redis", "rabbitmq", "nginx", "grafana", "prometheus", "flink",
  ];

  it("never draws one of these products with AWS artwork", () => {
    const wrong = [];
    for (const key of PRODUCTS) {
      const icon = SERVICES[key]?.icon;
      if (!icon) continue;
      const file = icon.replace("/icons/", "");
      if (!files.includes(file)) { wrong.push(`${key}: ${icon} is not on disk`); continue; }
      if (isAws(read(file))) wrong.push(`${key}: ${file} is AWS artwork (${titleOf(read(file))})`);
    }
    expect(wrong).toEqual([]);
  });

  it("still offers the managed AWS service under its own key", () => {
    for (const key of ["rds", "keyspaces", "opensearch", "msk", "elasticache"]) {
      expect(isAws(read(SERVICES[key].icon.replace("/icons/", "")))).toBe(true);
    }
  });
});
