import handler from "../../../../../lib/handlers/push-to-miro.js";
import { withErrors } from "../../../../../lib/wrap.js";
import { toRoute } from "../../../../../lib/next-adapter.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A 30-node board is 60-odd sequential-ish Miro calls with backoff.
export const maxDuration = 60;

export const POST = toRoute(withErrors(handler));
