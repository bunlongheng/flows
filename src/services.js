import { colorFromIcon } from './iconColor.js'
// ─── AWS Service Config ───────────────────────────────────────────────────────
// A node's colour tints its card and drives the edge gradient, so it has to
// match the ICON it wraps. The AWS database glyphs are blue; several were tinted
// magenta, which read as a pink card around a blue icon.

export const SERVICES = {
  apigw:        { label: 'API Gateway',       sub: 'External Trigger',   icon: '/icons/apigateway.svg',    color: '#e81b7e' },
  lambda:       { label: 'Lambda',            sub: 'Trigger Handler',    icon: '/icons/lambda.svg',        color: '#ed7405' },
  kms:          { label: 'KMS',               sub: 'Token Encryption',   icon: '/icons/kms.svg',           color: '#de3951' },
  dynamo:       { label: 'DynamoDB',          sub: 'Token Store',        icon: '/icons/dynamodb.svg',      color: '#4050d0' },
  sfn:          { label: 'Step Functions',    sub: 'Multi-Action Flow',  icon: '/icons/stepfunctions.svg', color: '#e81a7e' },
  insider:      { label: 'Insider Screener',  sub: 'SEC Form 4',         icon: '/icons/gen-insider.svg',   color: '#F5821F' },
  cloudwatch:   { label: 'CloudWatch',        sub: 'Monitoring',         icon: '/icons/cloudwatch.svg',    color: '#e81b7e' },
  cloudtrail:   { label: 'CloudTrail',        sub: 'Audit Logs',         icon: '/icons/cloudtrail.svg',    color: '#e7187d' },
  user:         { label: 'User',              sub: 'Client',             color: '#3b82f6', icon: '/icons/gen-user.svg' },
  client:       { label: 'Client',            sub: 'Browser / App',      color: '#3b82f6', icon: '/icons/gen-client.svg' },
  oauth:        { label: 'OAuth Provider',    sub: 'Auth Service',       color: '#22c55e', icon: '/icons/gen-oauth.svg' },
  auth:         { label: 'Auth Service',      sub: 'Authentication',     color: '#22c55e', icon: '/icons/gen-auth.svg' },
  cdn:          { label: 'CDN',               sub: 'Open Connect',        icon: '/icons/cloudfront.svg',  color: '#8f54ff' },
  cloudfront:   { label: 'CloudFront',        sub: 'CDN',                 icon: '/icons/cloudfront.svg',  color: '#8f54ff' },
  loadbalancer: { label: 'Load Balancer',     sub: 'Traffic Distribution',icon: '/icons/elb.svg',         color: '#8e52ff' },
  elb:          { label: 'Elastic LB',        sub: 'Load Balancer',       icon: '/icons/elb.svg',         color: '#8e52ff' },
  nginx:        { label: 'Nginx',             sub: 'Reverse Proxy',       icon: '/icons/nginx.svg',       color: '#22c55e' },
  zuul:         { label: 'Zuul Proxy',        sub: 'API Proxy',           color: '#a855f7', icon: '/icons/gen-zuul.svg' },
  gateway:      { label: 'API Gateway',       sub: 'Entry Point',         icon: '/icons/apigateway.svg',  color: '#e81b7e' },
  eureka:       { label: 'Eureka',            sub: 'Service Discovery',   color: '#f59e0b', icon: '/icons/gen-eureka.svg' },
  consul:       { label: 'Consul',            sub: 'Service Discovery',   color: '#f59e0b', icon: '/icons/gen-consul.svg' },
  ec2:          { label: 'EC2',               sub: 'Virtual Servers',     icon: '/icons/ec2.svg',         color: '#ed7406' },
  microservices:{ label: 'Microservices',     sub: 'Business Logic',      color: '#F7DF1E', icon: '/icons/gen-microservices.svg' },
  service:      { label: 'Service',           sub: 'Microservice',        color: '#339933', icon: '/icons/gen-service.svg' },
  encoder:      { label: 'Encoding Pipeline', sub: 'Media Processing',    color: '#f97316', icon: '/icons/gen-encoder.svg' },
  cassandra:    { label: 'Cassandra',         sub: 'NoSQL DB',            icon: '/icons/keyspaces.svg',   color: '#4050d0' },
  keyspaces:    { label: 'Keyspaces',         sub: 'Cassandra-compat',    icon: '/icons/keyspaces.svg',   color: '#4050d0' },
  postgres:     { label: 'PostgreSQL',        sub: 'Relational DB',       icon: '/icons/rds.svg',         color: '#4060e0' },
  mysql:        { label: 'MySQL',             sub: 'Relational DB',       icon: '/icons/rds.svg',         color: '#4060e0' },
  rds:          { label: 'RDS',               sub: 'Relational DB',       icon: '/icons/rds.svg',         color: '#4060e0' },
  mongodb:      { label: 'MongoDB',           sub: 'Document DB',         icon: '/icons/mongodb.svg',  color: '#22c55e' },
  redis:        { label: 'Redis',             sub: 'Cache / Session',     icon: '/icons/redis-2026.svg',  color: '#FF4438' },
  memcached:    { label: 'Memcached',         sub: 'EVCache',             icon: '/icons/elasticache.svg', color: '#cb2cd2' },
  elasticache:  { label: 'ElastiCache',       sub: 'Cache Layer',         icon: '/icons/elasticache.svg', color: '#cb2cd2' },
  s3:           { label: 'S3',               sub: 'Object Storage',       icon: '/icons/s3.svg',          color: '#688724' },
  storage:      { label: 'Storage',          sub: 'Object Store',         color: '#16a34a', icon: '/icons/gen-storage.svg' },
  kafka:        { label: 'Kafka',            sub: 'Event Streaming',      icon: '/icons/kafka.svg',       color: '#8f54ff' },
  msk:          { label: 'MSK',             sub: 'Managed Kafka',         icon: '/icons/kafka.svg',       color: '#8f54ff' },
  sqs:          { label: 'SQS',             sub: 'Message Queue',         icon: '/icons/sqs.svg',         color: '#e81b7f' },
  sns:          { label: 'SNS',             sub: 'Notifications',         icon: '/icons/sns.svg',         color: '#e81b7e' },
  eventbridge:  { label: 'EventBridge',     sub: 'Event Bus',             icon: '/icons/eventbridge.svg', color: '#e81b7e' },
  rabbitmq:     { label: 'RabbitMQ',        sub: 'Message Broker',        icon: '/icons/rabbitmq.svg',    color: '#f97316' },
  flink:        { label: 'Apache Flink',    sub: 'Stream Processing',     icon: '/icons/flink.svg',       color: '#6366f1' },
  spark:        { label: 'Apache Spark',    sub: 'Batch Processing',      color: '#f97316', icon: '/icons/gen-spark.svg' },
  ml:           { label: 'ML Platform',     sub: 'Recommendations',       icon: '/icons/sagemaker.svg',   color: '#0aab91' },
  sagemaker:    { label: 'SageMaker',       sub: 'ML Training',           icon: '/icons/sagemaker.svg',   color: '#0aab91' },
  claude:       { label: 'Claude',          sub: 'LLM',                   icon: '/icons/claude.svg',      color: '#D97757' },
  elasticsearch:{ label: 'Elasticsearch',  sub: 'Logs & Search',         icon: '/icons/opensearch.svg',  color: '#8f54ff' },
  opensearch:   { label: 'OpenSearch',      sub: 'Search & Analytics',    icon: '/icons/opensearch.svg',  color: '#8f54ff' },
  atlas:        { label: 'Atlas',          sub: 'Monitoring',             color: '#ec4899', icon: '/icons/gen-atlas.svg' },
  grafana:      { label: 'Grafana',        sub: 'Dashboards',             icon: '/icons/grafana.svg',     color: '#f97316' },
  prometheus:   { label: 'Prometheus',     sub: 'Metrics',                icon: '/icons/prometheus.svg',  color: '#ef4444' },
  // AWS — extended
  ecs:          { label: 'ECS',            sub: 'Container Service',      icon: '/icons/aws-ecs.svg',     color: '#e67b13' },
  eks:          { label: 'EKS',            sub: 'Kubernetes',             icon: '/icons/aws-eks.svg',     color: '#e67b13' },
  fargate:      { label: 'Fargate',        sub: 'Serverless Compute',     icon: '/icons/aws-fargate.svg', color: '#e67c14' },
  route53:      { label: 'Route 53',       sub: 'DNS',                    icon: '/icons/aws-route53.svg', color: '#7b4cd4' },
  waf:          { label: 'WAF',            sub: 'Web App Firewall',       icon: '/icons/aws-waf.svg',     color: '#df343a' },
  shield:       { label: 'Shield',         sub: 'DDoS Protection',        icon: '/icons/aws-shield.svg',  color: '#df3239' },
  cognito:      { label: 'Cognito',        sub: 'User Auth',              icon: '/icons/aws-cognito.svg', color: '#de3239' },
  iam:          { label: 'IAM',            sub: 'Identity & Access',      icon: '/icons/aws-iam.svg',     color: '#df333a' },
  secretsmanager:{ label: 'Secrets Manager',sub: 'Secret Store',          icon: '/icons/aws-secrets-manager.svg', color: '#df343b' },
  aurora:       { label: 'Aurora',         sub: 'Managed MySQL/Postgres', icon: '/icons/aurora.svg',      color: '#2E5FE8' },
  redshift:     { label: 'Redshift',       sub: 'Data Warehouse',         icon: '/icons/aws-redshift.svg',color: '#7a4bd4' },
  kinesis:      { label: 'Kinesis',        sub: 'Real-time Streaming',    icon: '/icons/aws-kinesis.svg', color: '#7a4cd4' },
  glue:         { label: 'Glue',           sub: 'ETL Service',            icon: '/icons/aws-glue.svg',    color: '#7849d3' },
  athena:       { label: 'Athena',         sub: 'Serverless Query',       icon: '/icons/aws-athena.svg',  color: '#7a4cd4' },
  cloudformation:{ label: 'CloudFormation',sub: 'IaC',                    icon: '/icons/aws-cloudformation.svg', color: '#e53a78' },
  codepipeline: { label: 'CodePipeline',   sub: 'CI/CD Pipeline',         icon: '/icons/aws-codepipeline.svg', color: '#4d69e6' },
  codebuild:    { label: 'CodeBuild',      sub: 'Build Service',          icon: '/icons/aws-codebuild.svg',    color: '#4d68e6' },
  codedeploy:   { label: 'CodeDeploy',     sub: 'Deployment',             icon: '/icons/aws-codedeploy.svg',   color: '#4b66e5' },
  ecr:          { label: 'ECR',            sub: 'Container Registry',     icon: '/icons/aws-ecr.svg',     color: '#f28715' },
  vpc:          { label: 'VPC',            sub: 'Virtual Network',        icon: '/icons/aws-vpc.svg',     color: '#794ad3' },
  acm:          { label: 'ACM',            sub: 'Certificate Manager',    icon: '/icons/aws-acm.svg',     color: '#de3138' },
  ses:          { label: 'SES',            sub: 'Email Service',          icon: '/icons/aws-ses.svg',     color: '#df353c' },
  amplify:      { label: 'Amplify',        sub: 'Frontend Hosting',       icon: '/icons/aws-amplify.svg', color: '#ffb000' },
  appsync:      { label: 'AppSync',        sub: 'GraphQL API',            icon: '/icons/aws-appsync.svg', color: '#e53b79' },
  dynamostreams:{ label: 'DynamoDB Streams',sub: 'Change Data Capture',   icon: '/icons/aws-dynamodb-streams.svg', color: '#4a65e5' },
  elasticbeanstalk:{ label: 'Elastic Beanstalk',sub: 'App Platform',      icon: '/icons/aws-elasticbeanstalk.svg', color: '#e67b12' },
  // GCP
  cloudrun:     { label: 'Cloud Run',      sub: 'Serverless Containers',  icon: '/icons/gcp-cloud-run.svg',      color: '#4283ef' },
  gke:          { label: 'GKE',            sub: 'Kubernetes Engine',      icon: '/icons/gcp-gke.svg',            color: '#326ce5' },
  cloudfunctions:{ label: 'Cloud Functions',sub: 'Serverless Functions',   icon: '/icons/gcp-cloud-functions.svg',color: '#4283ee' },
  cloudstorage: { label: 'Cloud Storage',  sub: 'Object Storage',         icon: '/icons/gcp-cloud-storage.svg',  color: '#3380ee' },
  bigquery:     { label: 'BigQuery',       sub: 'Data Warehouse',         icon: '/icons/gcp-bigquery.svg',       color: '#669df6' },
  cloudsql:     { label: 'Cloud SQL',      sub: 'Managed SQL',            icon: '/icons/gcp-cloud-sql.svg',      color: '#327fee' },
  pubsub:       { label: 'Pub/Sub',        sub: 'Message Queue',          icon: '/icons/gcp-pubsub.svg',         color: '#4285f4' },
  cloudcdn:     { label: 'Cloud CDN',      sub: 'Content Delivery',       icon: '/icons/gcp-cloud-cdn.svg',      color: '#317eee' },
  gcplb:        { label: 'Cloud LB',       sub: 'Load Balancing',         icon: '/icons/gcp-cloud-load-balancing.svg', color: '#307eee' },
  firestore:    { label: 'Firestore',      sub: 'Document DB',            icon: '/icons/gcp-firestore.svg',      color: '#ffca28' },
  spanner:      { label: 'Spanner',        sub: 'Global SQL',             icon: '/icons/gcp-spanner.svg',        color: '#307dee' },
  memorystore:  { label: 'Memorystore',    sub: 'Managed Redis',          icon: '/icons/gcp-cloud-memorystore.svg', color: '#317eee' },
  cloudtasks:   { label: 'Cloud Tasks',    sub: 'Task Queue',             icon: '/icons/gcp-cloud-tasks.svg',    color: '#2e7cee' },
  cloudscheduler:{ label: 'Cloud Scheduler',sub: 'Cron Jobs',             icon: '/icons/gcp-cloud-scheduler.svg',color: '#317eee' },
  vertexai:     { label: 'Vertex AI',      sub: 'ML Platform',            icon: '/icons/gcp-vertex-ai.svg',      color: '#2f7dee' },
  cloudbuild:   { label: 'Cloud Build',    sub: 'CI/CD',                  icon: '/icons/gcp-cloud-build.svg',    color: '#2f7dee' },
  clouddeploy:  { label: 'Cloud Deploy',   sub: 'CD Pipeline',            icon: '/icons/gcp-cloud-deploy.svg',   color: '#307dee' },
  artifactregistry:{ label: 'Artifact Registry',sub: 'Container Registry',icon: '/icons/gcp-artifact-registry.svg', color: '#3581ef' },
  cloudarmor:   { label: 'Cloud Armor',    sub: 'WAF / DDoS',             icon: '/icons/gcp-cloud-armor.svg',    color: '#317eee' },
  gcpiam:       { label: 'Cloud IAM',      sub: 'Identity & Access',      icon: '/icons/gcp-cloud-iam.svg',      color: '#307dee' },
  clouddns:     { label: 'Cloud DNS',      sub: 'DNS Service',            icon: '/icons/gcp-cloud-dns.svg',      color: '#327fee' },
  cloudlogging: { label: 'Cloud Logging',  sub: 'Log Management',         icon: '/icons/gcp-cloud-logging.svg',  color: '#3580ef' },
  cloudmonitoring:{ label: 'Cloud Monitoring',sub: 'Metrics & Alerts',    icon: '/icons/gcp-cloud-monitoring.svg',color: '#337fee' },
  gcpgateway:   { label: 'API Gateway',    sub: 'GCP API Gateway',        icon: '/icons/gcp-api-gateway.svg',    color: '#3480ee' },

  // ─── SaaS / tools / integration platforms (non-cloud brands) ────────────────
  python:       { label: 'Python',         sub: 'Runtime',                icon: '/brand/python.svg',        color: '#3776AB' },
  fastapi:      { label: 'FastAPI',        sub: 'API Framework',          icon: '/brand/fastapi.svg',       color: '#05998B' },
  hubspot:      { label: 'HubSpot',        sub: 'CRM',                    icon: '/brand/hubspot.svg',       color: '#FF7A59' },
  mailchimp:    { label: 'Mailchimp',      sub: 'Email Marketing',        icon: '/brand/mailchimp.svg',     color: '#FFE01B' },
  jotform:      { label: 'Jotform',        sub: 'Forms',                  icon: '/brand/jotform.png',       color: '#FF6100' },
  googlecontacts:{ label: 'Google Contacts',sub: 'Contacts',             icon: '/brand/googlecontacts.png', color: '#1A73E8' },
  cyclr:        { label: 'Cyclr',          sub: 'Embedded iPaaS',         icon: '/brand/cyclr.png',         color: '#E5202E' },
  jobber:       { label: 'Jobber',         sub: 'Field Service CRM',      icon: '/brand/jobber.png',        color: '#1F5C4A' },
  housecallpro: { label: 'Housecall Pro',  sub: 'Field Service CRM',      icon: '/brand/housecallpro.png',  color: '#1877F2' },
  integry:      { label: 'Integry',        sub: 'Embedded Integrations',  icon: '/brand/integry.png',       color: '#34A853' },
  launchdarkly: { label: 'LaunchDarkly',     sub: 'Feature Flags',          icon: '/brand/launchdarkly.png',  color: '#000000' },
  thryv:        { label: 'Thryv',          sub: 'Marketing Center',       icon: '/brand/thryv.png',         color: '#FF4E00' },
  auth0:        { label: 'Auth0',          sub: 'Identity',               icon: '/brand/auth0.png',         color: '#EB5424' },
  thryvbc:      { label: 'Thryv',          sub: 'Business Center',        icon: '/brand/thryv.png',         color: '#FF4E00' },
  gcp:          { label: 'Google Cloud',   sub: 'GCP',                    icon: '/brand/gcp.svg',           color: '#4285F4' },
  alloydb:      { label: 'AlloyDB AI',     sub: 'Managed Postgres',       icon: '/brand/alloydb.svg',       color: '#4285F4' },
}

export const PALETTE = ["#ef4444","#f97316","#eab308","#22c55e","#14b8a6","#06b6d4","#3b82f6","#8b5cf6","#ec4899","#f43f5e","#84cc16","#0891b2"]

export const TAG_PALETTE = [
  { bg: '#ede9fe', text: '#7c3aed', border: '#c4b5fd' },
  { bg: '#fef3c7', text: '#d97706', border: '#fcd34d' },
  { bg: '#dbeafe', text: '#2563eb', border: '#93c5fd' },
  { bg: '#dcfce7', text: '#16a34a', border: '#86efac' },
  { bg: '#fce7f3', text: '#db2777', border: '#f9a8d4' },
  { bg: '#e0e7ff', text: '#4f46e5', border: '#a5b4fc' },
  { bg: '#ffedd5', text: '#ea580c', border: '#fdba74' },
  { bg: '#f0fdfa', text: '#0d9488', border: '#5eead4' },
]

export function tagColor(tag) {
  let h = 0
  for (let i = 0; i < tag.length; i++) h = ((h << 5) - h + tag.charCodeAt(i)) | 0
  return TAG_PALETTE[Math.abs(h) % TAG_PALETTE.length]
}

export function findService(data) {
  // Bring-your-own-icon: a node may carry its own brand (icon + label/color/sub),
  // so ANY service - not just the built-in AWS catalog - can render. The icon is a
  // same-origin path ("/brand/foo.svg") or a data:image URI (CSP allows both).
  if (data && typeof data.icon === 'string' && data.icon) {
    // No explicit colour: take it from the logo itself, so a Chrome node draws
    // Chrome blue and a terminal draws terminal green. Grey only when the icon
    // states no colour at all.
    return { icon: data.icon, label: data.label || data.id, color: data.color || colorFromIcon(data.icon) || '#6b7280', sub: data.sub }
  }
  const lbl = (data.label || '').toLowerCase()
  const id  = (data.id  || '').toLowerCase()
  const byId = SERVICES[data.id]
  if (byId?.icon) return byId
  const byLabel = Object.values(SERVICES).find(s => s.icon && (() => {
    const sl = s.label.toLowerCase()
    return lbl === sl || lbl.startsWith(sl) || lbl.includes(sl)
  })())
  if (byLabel) return byLabel
  const byKeyIcon = Object.entries(SERVICES).find(([k, v]) => v.icon && id && (id.includes(k) || k.includes(id)))
  if (byKeyIcon) return byKeyIcon[1]
  if (byId) return byId
  if (!lbl) return {}
  return Object.values(SERVICES).find(s => {
    const sl = s.label.toLowerCase()
    return sl === lbl || sl.includes(lbl) || lbl.includes(sl)
  }) || {}
}
