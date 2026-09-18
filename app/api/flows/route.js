import handler from "../../../lib/handlers/list-flows.js";
import { withErrors } from "../../../lib/wrap.js";
import { toRoute } from "../../../lib/next-adapter.js";

// Node runtime: these handlers use pg and, for the card, a native rasteriser.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const route = toRoute(withErrors(handler));
export const GET = route;
export const HEAD = route;
