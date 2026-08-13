import { test, expect } from "@playwright/test";
import { uniqueAlias } from "../../utils/unique";

test.describe("API — redirect & click analytics", () => {
  test("302-redirects to the destination and counts each click", async ({
    request,
  }) => {
    const alias = uniqueAlias("go");
    const created = await request.post("/api/shorten", {
      data: { url: "https://example.com/dest", alias },
    });
    expect(created.status()).toBe(201);

    // maxRedirects: 0 so we observe the 302 itself rather than following it.
    const r1 = await request.get(`/${alias}`, {
      maxRedirects: 0,
      headers: { referer: "https://news.ycombinator.com/" },
    });
    expect(r1.status()).toBe(302);
    expect(r1.headers()["location"]).toBe("https://example.com/dest");

    await request.get(`/${alias}`, { maxRedirects: 0 });

    const stats = await request.get(`/api/stats/${alias}`);
    expect(stats.status()).toBe(200);
    const body = await stats.json();
    expect(body.clickCount).toBe(2);
    const referrers = body.topReferrers.map(
      (r: { referer: string }) => r.referer,
    );
    expect(referrers).toContain("news.ycombinator.com");
    expect(referrers).toContain("(direct)");
  });

  test("returns 404 for an unknown short code", async ({ request }) => {
    const res = await request.get(`/${uniqueAlias("nope")}`, {
      maxRedirects: 0,
    });
    expect(res.status()).toBe(404);
  });
});
