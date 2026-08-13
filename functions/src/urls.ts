/**
 * Resolving the public base URL for a short link.
 *
 * The `Host` header the function receives is NOT the address a user should
 * click:
 *  - On the emulator, Hosting proxies to the function with an internal host
 *    (`127.0.0.1:5001`, the Functions emulator) — hitting that directly 404s
 *    because the Functions emulator expects a `/PROJECT/REGION/app/...` prefix.
 *  - In production (Cloud Functions v2 behind Hosting), `Host` is the internal
 *    Cloud Run URL; the public domain arrives in `X-Forwarded-Host`.
 *
 * So we resolve the base in priority order, and keep it pure so it can be
 * unit-tested without spinning up an emulator.
 */

export interface BaseUrlInput {
  /** Explicit override, e.g. a configured custom domain. Wins if set. */
  publicBaseUrl?: string;
  /** True when running under the Firebase emulator (FUNCTIONS_EMULATOR). */
  isEmulator: boolean;
  /** Hosting emulator origin to use in dev (defaults to the firebase.json port). */
  emulatorBaseUrl?: string;
  /** `X-Forwarded-Host` — the public domain behind real Firebase Hosting. */
  forwardedHost?: string;
  /** `X-Forwarded-Proto` — https behind Hosting. */
  forwardedProto?: string;
  /** The request's own `Host` header (last-resort fallback). */
  host?: string;
  /** The request protocol used with `host`. */
  protocol?: string;
}

const DEFAULT_EMULATOR_BASE = "http://localhost:5050";

/** Strip trailing slashes so we can safely append `/code`. */
function trimTrailingSlash(s: string): string {
  return s.replace(/\/+$/, "");
}

/** A header may be a string, a comma list, or an array — take the first value. */
export function firstHeaderValue(
  value: string | string[] | undefined,
): string | undefined {
  if (value === undefined) return undefined;
  const raw = Array.isArray(value) ? value[0] : value;
  const first = raw.split(",")[0]?.trim();
  return first || undefined;
}

export function resolveBaseUrl(input: BaseUrlInput): string {
  // 1. Explicit override (production custom domain / deployment config).
  if (input.publicBaseUrl) return trimTrailingSlash(input.publicBaseUrl);

  // 2. Emulator: use the Hosting emulator origin, not the internal Host.
  if (input.isEmulator) {
    return trimTrailingSlash(input.emulatorBaseUrl || DEFAULT_EMULATOR_BASE);
  }

  // 3. Behind real Firebase Hosting: the public domain is in X-Forwarded-Host.
  if (input.forwardedHost) {
    const proto = input.forwardedProto || "https";
    return `${proto}://${input.forwardedHost}`;
  }

  // 4. Last resort: the request's own Host.
  if (input.host) {
    return `${input.protocol || "https"}://${input.host}`;
  }
  return "";
}

/** Build the full short URL for a code, or a relative `/code` if no base. */
export function buildShortUrlFrom(input: BaseUrlInput, code: string): string {
  const base = resolveBaseUrl(input);
  return base ? `${base}/${code}` : `/${code}`;
}
