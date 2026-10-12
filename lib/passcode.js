import { scrypt, randomBytes, createHmac, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

// The share passcode, same scheme as Stickies (lib/lock-password.ts). scrypt
// runs async on the threadpool so a flood of guesses at the public gate
// cannot freeze the event loop.
const scryptAsync = promisify(scrypt);

/** `salt$scrypt(passcode, salt)`, both hex. */
export async function hashPasscode(plain) {
  const salt = randomBytes(16);
  const key = await scryptAsync(plain, salt, 32);
  return `${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPasscode(plain, stored) {
  if (!stored || !stored.includes("$")) return false;
  const [saltHex, hashHex] = stored.split("$");
  if (!saltHex || !hashHex) return false;
  try {
    const expected = Buffer.from(hashHex, "hex");
    const actual = await scryptAsync(plain, Buffer.from(saltHex, "hex"), expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch { return false; }
}

// The unlock cookie is an HMAC of the flow id and the CURRENT hash, so
// changing or removing the passcode voids every cookie already handed out.
function sign(flowId, hash) {
  return createHmac("sha256", process.env.AUTH_SECRET || "flows-passcode").update(`${flowId}::${hash}`).digest("hex");
}

export const unlockToken = sign;

export function unlockCookieName(flowId) {
  return `flows_unlock_${String(flowId).replace(/[^a-z0-9-]/gi, "")}`;
}

/** True when the request's cookie header holds a valid unlock for this flow. */
export function isUnlocked(cookieHeader, flowId, hash) {
  const name = unlockCookieName(flowId);
  const part = String(cookieHeader || "").split(/;\s*/).find((p) => p.startsWith(`${name}=`));
  if (!part) return false;
  const a = Buffer.from(sign(flowId, hash), "hex");
  const b = Buffer.from(decodeURIComponent(part.slice(name.length + 1)), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
