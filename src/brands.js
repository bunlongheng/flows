// Real-world brand per demo (logo + one-line subtitle). Keyed by the clean title.
// Lives in its own module so both DiagramCard and DetailView can import brandFor
// without tripping React Fast Refresh (a component file must export only components).
export const BRANDS = {
  stripe: { icon: '/brand/stripe.svg', sub: 'Payments' },
  twitter: { icon: '/brand/twitter.svg', sub: 'News Feed' },
  netflix: { icon: '/brand/netflix.svg', sub: 'Video Streaming' },
  youtube: { icon: '/brand/youtube.svg', sub: 'Video Streaming' },
  uber: { icon: '/brand/uber.svg', sub: 'Realtime Matching' },
  slack: { icon: '/brand/slack.svg', sub: 'Realtime Chat' },
  dropbox: { icon: '/brand/dropbox.svg', sub: 'File Sync' },
  bitly: { icon: '/brand/bitly.svg', sub: 'URL Shortener' },
  'llm inference': { icon: '/brand/anthropic.svg', sub: 'AI Inference' },
  'rate limiter': { icon: '/brand/cloudflare.svg', sub: 'Rate Limiting' },
  'claude code': { icon: '/brand/claude.svg', sub: 'AI Coding Agent' },
  'claude code - ai coding agent': { icon: '/brand/claude.svg', sub: 'AI Coding Agent' },
  chatgpt: { icon: '/brand/openai.svg', sub: 'Conversational AI' },
  jarvis: { icon: '/brand/jarvis.svg', sub: 'Voice AI' },
  'zapier - workflow automation': { icon: '/brand/zapier.svg', sub: 'Workflow Automation' },
  'email newsletter - 500m subscribers': { icon: '/brand/mailchimp.svg', sub: 'Bulk Email Delivery' },
  'chatgpt - conversational ai at scale': { icon: '/brand/openai.svg', sub: 'Conversational AI' },
}

export const brandFor = title => BRANDS[String(title || '').trim().toLowerCase()] || null
