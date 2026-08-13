import { test, expect } from "@playwright/test";
import { uniqueAlias } from "../../utils/unique";

/**
 * API tests via Playwright's built-in `request` fixture (baseURL :5050).
 * These hit the real Cloud Function through the Hosting rewrite.
 */
test.describe("API — shorten & stats", () => {
  test("health reports ok", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.service).toBe("url-shortener");
  });

  test("creates a short link for a valid URL", async ({ request }) => {
    const res = await request.post("/api/shorten", {
      data: { url: "https://example.com/some/page" },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.code).toMatch(/^[0-9A-Za-z]{7,}$/);
    expect(body.url).toBe("https://example.com/some/page");
    // Emulator resolves the public base to the Hosting origin.
    expect(body.shortUrl).toBe(`http://localhost:5050/${body.code}`);
  });

  test("honors a custom alias", async ({ request }) => {
    const alias = uniqueAlias("alias");
    const res = await request.post("/api/shorten", {
      data: { url: "https://example.com", alias },
    });
    expect(res.status()).toBe(201);
    expect((await res.json()).code).toBe(alias);
  });

  test("rejects a javascript: URL with 400", async ({ request }) => {
    const res = await request.post("/api/shorten", {
      data: { url: "javascript:alert(1)" },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBeTruthy();
  });

  test("rejects a duplicate alias with 409", async ({ request }) => {
    const alias = uniqueAlias("dup");
    const first = await request.post("/api/shorten", {
      data: { url: "https://example.com", alias },
    });
    expect(first.status()).toBe(201);
    const second = await request.post("/api/shorten", {
      data: { url: "https://other.com", alias },
    });
    expect(second.status()).toBe(409);
  });

  test("rejects a reserved alias with 400", async ({ request }) => {
    const res = await request.post("/api/shorten", {
      data: { url: "https://example.com", alias: "api" },
    });
    expect(res.status()).toBe(400);
  });

  test("404s stats for an unknown code", async ({ request }) => {
    const res = await request.get(`/api/stats/${uniqueAlias("missing")}`);
    expect(res.status()).toBe(404);
  });
});
