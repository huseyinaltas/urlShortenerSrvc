import request from "supertest";
import { initializeApp, getApps, deleteApp } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import type { Express } from "express";
import { createApp } from "./app";

/**
 * End-to-end API tests against the Firestore emulator.
 *
 * Run via `npm run test:integration`, which wraps jest in
 * `firebase emulators:exec --only firestore` and sets FIRESTORE_EMULATOR_HOST.
 * Without that env var (e.g. a bare `jest` run in an env with no Java) the whole
 * suite self-skips, so `npm test` stays green everywhere.
 */
const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;
const describeIfEmulator = EMULATOR ? describe : describe.skip;

const PROJECT_ID = process.env.GCLOUD_PROJECT || "demo-url-shortener";

async function clearFirestore(): Promise<void> {
  const res = await fetch(
    `http://${EMULATOR}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: "DELETE" },
  );
  if (!res.ok) throw new Error(`Failed to clear emulator: ${res.status}`);
}

describeIfEmulator("URL shortener API (emulator)", () => {
  let db: Firestore;
  let app: Express;

  beforeAll(() => {
    if (getApps().length === 0) initializeApp({ projectId: PROJECT_ID });
    db = getFirestore();
    app = createApp(db);
  });

  afterAll(async () => {
    await Promise.all(getApps().map((a) => deleteApp(a)));
  });

  beforeEach(async () => {
    await clearFirestore();
  });

  describe("GET /api/health", () => {
    it("reports ok", async () => {
      const res = await request(app).get("/api/health");
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  describe("POST /api/shorten", () => {
    it("creates a short link for a valid URL", async () => {
      const res = await request(app)
        .post("/api/shorten")
        .send({ url: "https://example.com/some/page" });
      expect(res.status).toBe(201);
      expect(res.body.code).toMatch(/^[0-9A-Za-z]{7,}$/);
      expect(res.body.url).toBe("https://example.com/some/page");
      expect(res.body.shortUrl).toContain(res.body.code);
    });

    it("honors a valid custom alias", async () => {
      const res = await request(app)
        .post("/api/shorten")
        .send({ url: "https://example.com", alias: "promo" });
      expect(res.status).toBe(201);
      expect(res.body.code).toBe("promo");
    });

    it("rejects a duplicate alias with 409", async () => {
      await request(app)
        .post("/api/shorten")
        .send({ url: "https://example.com", alias: "dup" });
      const res = await request(app)
        .post("/api/shorten")
        .send({ url: "https://other.com", alias: "dup" });
      expect(res.status).toBe(409);
    });

    it("rejects an invalid URL with 400", async () => {
      const res = await request(app)
        .post("/api/shorten")
        .send({ url: "javascript:alert(1)" });
      expect(res.status).toBe(400);
      expect(res.body.error).toBeTruthy();
    });

    it("rejects a reserved alias with 400", async () => {
      const res = await request(app)
        .post("/api/shorten")
        .send({ url: "https://example.com", alias: "api" });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /:code (redirect + analytics)", () => {
    it("302-redirects and counts each click", async () => {
      const created = await request(app)
        .post("/api/shorten")
        .send({ url: "https://example.com/dest", alias: "goto" });
      expect(created.status).toBe(201);

      const r1 = await request(app).get("/goto").set("referer", "https://twitter.com/x");
      expect(r1.status).toBe(302);
      expect(r1.headers.location).toBe("https://example.com/dest");

      await request(app).get("/goto");

      const stats = await request(app).get("/api/stats/goto");
      expect(stats.status).toBe(200);
      expect(stats.body.clickCount).toBe(2);
      expect(stats.body.sampledClicks).toBe(2);
      // Referrer breakdown captured the host and the direct hit.
      const hosts = stats.body.topReferrers.map((r: { referer: string }) => r.referer);
      expect(hosts).toContain("twitter.com");
      expect(hosts).toContain("(direct)");
      // Timeline has today's bucket populated.
      const total = stats.body.timeline.reduce(
        (a: number, d: { count: number }) => a + d.count,
        0,
      );
      expect(total).toBe(2);
    });

    it("returns 404 HTML for an unknown code", async () => {
      const res = await request(app).get("/nope404");
      expect(res.status).toBe(404);
      expect(res.headers["content-type"]).toMatch(/html/);
    });
  });

  describe("GET /api/stats/:code", () => {
    it("404s for an unknown code", async () => {
      const res = await request(app).get("/api/stats/missing");
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/links", () => {
    it("lists recent links newest-first", async () => {
      await request(app).post("/api/shorten").send({ url: "https://a.com", alias: "aaa" });
      await request(app).post("/api/shorten").send({ url: "https://b.com", alias: "bbb" });
      const res = await request(app).get("/api/links?limit=10");
      expect(res.status).toBe(200);
      expect(res.body.links.length).toBe(2);
      expect(res.body.links[0].code).toBe("bbb"); // most recent first
    });
  });
});
