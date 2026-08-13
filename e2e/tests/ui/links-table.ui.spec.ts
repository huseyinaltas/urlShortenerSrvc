import { test, expect } from "@playwright/test";
import { DashboardPage } from "../../pages/DashboardPage";
import { uniqueAlias } from "../../utils/unique";

/**
 * Table + analytics validation. The three scenarios build on one link, so they
 * run serially and share the alias (the link persists in the emulator across
 * tests within a run).
 */
const DEST = "https://example.com/table-analytics";
let alias: string;

test.describe.serial("UI — Links table & analytics validation", () => {
  test("1) add a link — row shows code, destination, 0 clicks, just-now time", async ({
    page,
  }) => {
    alias = uniqueAlias("tbl");
    const dash = new DashboardPage(page);
    await dash.goto();

    const shortUrl = await dash.createLink(DEST, alias);
    expect(shortUrl).toContain(alias);

    // The new row shows every column correctly.
    await expect(dash.linkRow(alias)).toBeVisible();
    await expect(dash.linkCode(alias)).toHaveText(alias);
    await expect(dash.linkDest(alias)).toHaveText(DEST);
    await expect(dash.linkClicks(alias)).toHaveText("0");
    await expect(dash.linkCreated(alias)).toHaveText("just now");
  });

  test("2) click once, then once more — table click count reads 1 then 2", async ({
    page,
    request,
  }) => {
    const dash = new DashboardPage(page);

    // First click (referred from twitter).
    await request.get(`/${alias}`, {
      maxRedirects: 0,
      headers: { referer: "https://twitter.com/post" },
    });
    await dash.goto();
    await expect(dash.linkClicks(alias)).toHaveText("1");

    // One more click (direct) → now 2.
    await request.get(`/${alias}`, { maxRedirects: 0 });
    await dash.goto();
    await expect(dash.linkClicks(alias)).toHaveText("2");
  });

  test("3) analytics panel — totals, timeline chart, and referrer breakdown", async ({
    page,
  }) => {
    const dash = new DashboardPage(page);
    await dash.goto();
    await dash.selectLink(alias);

    // Totals: lifetime counter and the 30-day window both read 2.
    await expect(dash.totalClicks).toHaveText("2");
    await expect(dash.last30Days).toHaveText("2");

    // Timeline chart is rendered.
    await expect(dash.timelineChart).toBeVisible();

    // Referrer breakdown: exactly the two sources we drove (twitter + direct).
    await expect(dash.topReferrers).toBeVisible();
    await expect(dash.referrerRows()).toHaveCount(2);
    await expect(dash.topReferrers).toContainText("twitter.com");
    await expect(dash.topReferrers).toContainText("(direct)");
  });
});
