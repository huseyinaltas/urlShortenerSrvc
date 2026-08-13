import { test, expect } from "@playwright/test";
import { DashboardPage } from "../../pages/DashboardPage";
import { uniqueAlias } from "../../utils/unique";

/**
 * URL validation from the UI: five different invalid inputs are each rejected
 * with an inline error and create no link; the last scenario is the expected
 * happy path — a valid https URL is accepted.
 *
 * Note: every invalid input below is still a *syntactically* valid absolute URL,
 * so it passes the browser's native `type="url"` check and reaches our
 * server-side validation (which is what we're asserting). Inputs like "not a
 * url" would be blocked by the browser before submit and are covered by the
 * unit tests instead.
 */
const invalidCases: { name: string; url: string; error: RegExp }[] = [
  { name: "javascript: scheme", url: "javascript:alert(1)", error: /http/i },
  { name: "ftp scheme", url: "ftp://example.com", error: /http/i },
  { name: "mailto scheme", url: "mailto:hi@example.com", error: /http/i },
  { name: "host without a dot", url: "http://localhost", error: /host/i },
  {
    name: "exceeds the length limit",
    url: "https://example.com/" + "a".repeat(2100),
    error: /2048/,
  },
];

test.describe("UI — URL validation", () => {
  for (const [i, c] of invalidCases.entries()) {
    test(`${i + 1}) rejects an invalid URL — ${c.name}`, async ({ page }) => {
      const dash = new DashboardPage(page);
      await dash.goto();

      await dash.attemptCreate(c.url);

      // An inline error explains why, and no short link is produced.
      await expect(dash.createError).toBeVisible();
      await expect(dash.createError).toHaveText(c.error);
      await expect(dash.resultShortUrl).toHaveCount(0);
    });
  }

  test("6) accepts the expected valid https URL", async ({ page }) => {
    const dash = new DashboardPage(page);
    await dash.goto();

    const alias = uniqueAlias("valid");
    const shortUrl = await dash.createLink(
      "https://example.com/finally-valid",
      alias,
    );

    // Success: a short URL is shown and no error is present.
    expect(shortUrl).toContain(alias);
    await expect(dash.resultShortUrl).toBeVisible();
    await expect(dash.createError).toHaveCount(0);
  });
});
