/**
 * Destination-URL validation and normalization.
 *
 * This is the security boundary for the shortener: a short link is a redirect
 * primitive, so we only ever mint one for an absolute http(s) URL. Anything
 * else (javascript:, data:, file:, mailto:, protocol-relative, garbage) is
 * rejected so a short link can never be used to smuggle a script or local-file
 * navigation past a victim's guard.
 */

export const MAX_URL_LENGTH = 2048;

export interface UrlValidationResult {
  ok: boolean;
  /** Normalized absolute URL, present only when ok is true. */
  url?: string;
  /** Human-readable reason, present only when ok is false. */
  reason?: string;
}

export function validateAndNormalizeUrl(input: unknown): UrlValidationResult {
  if (typeof input !== "string") {
    return { ok: false, reason: "A 'url' string is required." };
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, reason: "URL must not be empty." };
  }
  if (trimmed.length > MAX_URL_LENGTH) {
    return {
      ok: false,
      reason: `URL exceeds the ${MAX_URL_LENGTH}-character limit.`,
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      ok: false,
      reason: "URL is not valid. Include the scheme, e.g. https://example.com.",
    };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      ok: false,
      reason: "Only http:// and https:// URLs can be shortened.",
    };
  }
  if (!parsed.hostname || !parsed.hostname.includes(".")) {
    return { ok: false, reason: "URL must include a valid host." };
  }

  // URL#toString normalizes host casing, default ports, path encoding, etc.,
  // so the same destination always dedupes/stores identically.
  return { ok: true, url: parsed.toString() };
}
