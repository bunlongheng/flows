import handler from "../../../../../../lib/handlers/flow-versions.js";
import { withErrors } from "../../../../../../lib/wrap.js";
import { toRoute } from "../../../../../../lib/next-adapter.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = toRoute(withErrors(handler));
