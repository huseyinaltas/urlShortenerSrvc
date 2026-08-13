import {
  Firestore,
  FieldValue,
  Timestamp,
} from "firebase-admin/firestore";
import {
  generateCode,
  validateAlias,
  isReserved,
  DEFAULT_CODE_LENGTH,
} from "./codec";

/**
 * Data model
 * ----------
 * links/{code}
 *   url            string     destination (validated, normalized)
 *   code           string     the short code (== doc id, denormalized for reads)
 *   createdAt      Timestamp
 *   clickCount     number     atomic counter (FieldValue.increment)
 *   lastClickedAt  Timestamp | null
 *
 * links/{code}/clicks/{auto}   one document per redirect (append-only)
 *   at             Timestamp
 *   referer        string     "" when absent
 *   userAgent      string     "" when absent
 *
 * The counter on the parent gives O(1) totals for the common case; the clicks
 * subcollection backs the analytics timeline / referrer breakdown. A leaked web
 * key is useless because firestore.rules denies all client access — every read
 * and write goes through this server layer (Admin SDK).
 */

export const LINKS = "links";
export const CLICKS = "clicks";

export interface LinkRecord {
  code: string;
  url: string;
  createdAt: Timestamp;
  clickCount: number;
  lastClickedAt: Timestamp | null;
}

export class AliasTakenError extends Error {
  constructor(alias: string) {
    super(`The alias "${alias}" is already taken.`);
    this.name = "AliasTakenError";
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * How many random codes to try before giving up. Each attempt is a fresh code,
 * so with a 62^7 space this only ever matters under adversarial load — but
 * bounding it keeps a pathological case from looping forever.
 */
const MAX_CODE_ATTEMPTS = 5;

interface CreateLinkInput {
  url: string; // already validated + normalized by the caller
  alias?: string;
}

/**
 * Create a short link. When `alias` is given we honor it (rejecting reserved or
 * taken aliases); otherwise we mint random codes until one is free. Uniqueness
 * is enforced inside a transaction so two concurrent creates can't claim the
 * same code.
 */
export async function createLink(
  db: Firestore,
  input: CreateLinkInput,
): Promise<LinkRecord> {
  if (input.alias !== undefined) {
    const reason = validateAlias(input.alias);
    if (reason) throw new ValidationError(reason);
    return claimCode(db, input.alias, input.url);
  }

  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    // Longer codes after the first couple of collisions — a defensive taper
    // that only kicks in if the keyspace is genuinely crowded.
    const length = DEFAULT_CODE_LENGTH + Math.floor(attempt / 2);
    const code = generateCode(length);
    if (isReserved(code)) continue;
    try {
      return await claimCode(db, code, input.url);
    } catch (err) {
      if (err instanceof AliasTakenError) {
        lastErr = err;
        continue; // collision — try a new code
      }
      throw err;
    }
  }
  throw new Error(
    `Could not allocate a unique short code after ${MAX_CODE_ATTEMPTS} attempts` +
      (lastErr ? `: ${(lastErr as Error).message}` : "."),
  );
}

/**
 * Atomically claim `code` for `url`, failing if the code already exists.
 */
async function claimCode(
  db: Firestore,
  code: string,
  url: string,
): Promise<LinkRecord> {
  const ref = db.collection(LINKS).doc(code);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) throw new AliasTakenError(code);
    tx.set(ref, {
      code,
      url,
      createdAt: FieldValue.serverTimestamp(),
      clickCount: 0,
      lastClickedAt: null,
    });
  });
  const saved = await ref.get();
  return saved.data() as LinkRecord;
}

export async function getLink(
  db: Firestore,
  code: string,
): Promise<LinkRecord | null> {
  const snap = await db.collection(LINKS).doc(code).get();
  return snap.exists ? (snap.data() as LinkRecord) : null;
}

interface ClickMeta {
  referer?: string;
  userAgent?: string;
}

/**
 * Resolve a code to its destination and record the click. Returns the
 * destination URL, or null if the code is unknown. The counter bump, the
 * lastClickedAt stamp, and the click event are written in one atomic batch so
 * the total and the event log can never disagree.
 */
export async function resolveAndRecordClick(
  db: Firestore,
  code: string,
  meta: ClickMeta = {},
): Promise<string | null> {
  const linkRef = db.collection(LINKS).doc(code);
  const snap = await linkRef.get();
  if (!snap.exists) return null;
  const url = (snap.data() as LinkRecord).url;

  const clickRef = linkRef.collection(CLICKS).doc();
  const batch = db.batch();
  batch.update(linkRef, {
    clickCount: FieldValue.increment(1),
    lastClickedAt: FieldValue.serverTimestamp(),
  });
  batch.set(clickRef, {
    at: FieldValue.serverTimestamp(),
    referer: (meta.referer || "").slice(0, 512),
    userAgent: (meta.userAgent || "").slice(0, 512),
  });
  await batch.commit();
  return url;
}

export interface LinkSummary {
  code: string;
  url: string;
  createdAt: string | null;
  clickCount: number;
  lastClickedAt: string | null;
}

export interface LinkStats extends LinkSummary {
  /** Clicks per calendar day (UTC), oldest → newest, over `timeline` window. */
  timeline: { date: string; count: number }[];
  /** Referrer host → click count, highest first. */
  topReferrers: { referer: string; count: number }[];
  /** Number of click events inspected for the timeline/referrer breakdown. */
  sampledClicks: number;
}

function tsToIso(value: unknown): string | null {
  return value instanceof Timestamp ? value.toDate().toISOString() : null;
}

function toSummary(rec: LinkRecord): LinkSummary {
  return {
    code: rec.code,
    url: rec.url,
    createdAt: tsToIso(rec.createdAt),
    clickCount: rec.clickCount ?? 0,
    lastClickedAt: tsToIso(rec.lastClickedAt),
  };
}

/**
 * Most-recent links first — powers the dashboard list.
 */
export async function listLinks(
  db: Firestore,
  limit = 20,
): Promise<LinkSummary[]> {
  const q = await db
    .collection(LINKS)
    .orderBy("createdAt", "desc")
    .limit(Math.min(Math.max(limit, 1), 100))
    .get();
  return q.docs.map((d) => toSummary(d.data() as LinkRecord));
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Aggregate analytics for one code. We read the most recent `sampleSize` click
 * events and aggregate in memory (timeline + top referrers). This keeps the
 * demo index-free and fast; the trade-off — noted in the README — is that the
 * breakdown reflects a sample, while the headline `clickCount` is the exact
 * lifetime total from the atomic counter.
 */
export async function getStats(
  db: Firestore,
  code: string,
  opts: { days?: number; sampleSize?: number } = {},
): Promise<LinkStats | null> {
  const link = await getLink(db, code);
  if (!link) return null;

  const days = opts.days ?? 30;
  const sampleSize = opts.sampleSize ?? 500;

  const clicksSnap = await db
    .collection(LINKS)
    .doc(code)
    .collection(CLICKS)
    .orderBy("at", "desc")
    .limit(sampleSize)
    .get();

  // Seed the timeline with a zero for every day in the window so the chart has
  // a continuous x-axis even on days with no clicks.
  const timelineMap = new Map<string, number>();
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * DAY_MS);
    timelineMap.set(d.toISOString().slice(0, 10), 0);
  }

  const referrerMap = new Map<string, number>();
  for (const doc of clicksSnap.docs) {
    const data = doc.data();
    const at = data.at instanceof Timestamp ? data.at.toDate() : null;
    if (at) {
      const key = at.toISOString().slice(0, 10);
      if (timelineMap.has(key)) timelineMap.set(key, timelineMap.get(key)! + 1);
    }
    const referer = referrerHost(String(data.referer || ""));
    referrerMap.set(referer, (referrerMap.get(referer) || 0) + 1);
  }

  const timeline = [...timelineMap.entries()].map(([date, count]) => ({
    date,
    count,
  }));
  const topReferrers = [...referrerMap.entries()]
    .map(([referer, count]) => ({ referer, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    ...toSummary(link),
    timeline,
    topReferrers,
    sampledClicks: clicksSnap.size,
  };
}

/** Reduce a referer URL to its host; "(direct)" when empty/unparseable. */
function referrerHost(referer: string): string {
  if (!referer) return "(direct)";
  try {
    return new URL(referer).host || "(direct)";
  } catch {
    return "(other)";
  }
}
