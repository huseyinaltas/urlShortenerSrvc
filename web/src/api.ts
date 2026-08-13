/**
 * Thin API client. All calls are same-origin relative paths (`/api/*`):
 *  - dev: Vite proxies them to the Hosting emulator → `app` function
 *  - prod: Hosting serves this SPA and the function on one origin
 */

export interface ShortenResponse {
  code: string;
  shortUrl: string;
  url: string;
}

export interface LinkSummary {
  code: string;
  url: string;
  createdAt: string | null;
  clickCount: number;
  lastClickedAt: string | null;
}

export interface LinkStats extends LinkSummary {
  timeline: { date: string; count: number }[];
  topReferrers: { referer: string; count: number }[];
  sampledClicks: number;
}

async function parseError(res: Response): Promise<never> {
  let message = `Request failed (${res.status})`;
  try {
    const body = await res.json();
    if (body?.error) message = body.error;
  } catch {
    /* non-JSON error body — keep the status message */
  }
  throw new Error(message);
}

export async function shorten(
  url: string,
  alias?: string,
): Promise<ShortenResponse> {
  const res = await fetch("/api/shorten", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(alias ? { url, alias } : { url }),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function listLinks(limit = 20): Promise<LinkSummary[]> {
  const res = await fetch(`/api/links?limit=${limit}`);
  if (!res.ok) return parseError(res);
  const body = await res.json();
  return body.links;
}

export async function getStats(code: string): Promise<LinkStats> {
  const res = await fetch(`/api/stats/${encodeURIComponent(code)}`);
  if (!res.ok) return parseError(res);
  return res.json();
}
