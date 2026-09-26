import handler from "../../../lib/handlers/list-services.js";
import { withErrors } from "../../../lib/wrap.js";
import { toRoute } from "../../../lib/next-adapter.js";

export const runtime = "nodejs";

const route = toRoute(withErrors(handler));
export const GET = route;
export const HEAD = route;
