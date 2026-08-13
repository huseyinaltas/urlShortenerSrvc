import { randomInt } from "crypto";

/**
 * Short-code generation.
 *
 * Codes are base62 (`0-9A-Za-z`). At 7 chars that is 62^7 ≈ 3.5e12 possible
 * codes, so random generation collides vanishingly rarely; the store layer
 * still guards every insert with a uniqueness transaction, so correctness never
 * depends on that probability — the length only tunes how often we retry.
 */
export const ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export const DEFAULT_CODE_LENGTH = 7;

/**
 * Generate a random base62 code. Uses crypto.randomInt for a uniform draw over
 * the alphabet (Math.random would bias toward lower indices).
 */
export function generateCode(length: number = DEFAULT_CODE_LENGTH): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}

/**
 * Paths the redirect namespace can't hand out as short codes, because Hosting
 * (or the API itself) already owns them. Kept lowercase; matching is
 * case-insensitive.
 */
export const RESERVED_CODES = new Set([
  "api",
  "app",
  "health",
  "assets",
  "static",
  "favicon.ico",
  "robots.txt",
  "index.html",
]);

const ALIAS_RE = /^[A-Za-z0-9_-]{3,32}$/;

/**
 * Validate a user-supplied custom alias. Returns null when valid, or a
 * human-readable reason when not.
 */
export function validateAlias(alias: string): string | null {
  if (!ALIAS_RE.test(alias)) {
    return "Alias must be 3-32 chars, using letters, numbers, '-' or '_'.";
  }
  if (RESERVED_CODES.has(alias.toLowerCase())) {
    return `"${alias}" is reserved and can't be used as an alias.`;
  }
  return null;
}

export function isReserved(code: string): boolean {
  return RESERVED_CODES.has(code.toLowerCase());
}
