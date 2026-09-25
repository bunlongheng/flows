import handler from "../../../../lib/handlers/flow-by-id.js";
import { withErrors } from "../../../../lib/wrap.js";
import { toRoute } from "../../../../lib/next-adapter.js";

// Node runtime: these handlers use pg and, for the card, a native rasteriser.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A 3200px GIF is 14 rasterises of a 15MB frame; give a cold render room.
export const maxDuration = 60;

const route = toRoute(withErrors(handler));
export const GET = route;
export const HEAD = route;
export const PATCH = route;
export const DELETE = route;
