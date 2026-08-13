import { test, expect } from "@playwright/test";
import { DashboardPage } from "../../pages/DashboardPage";
import { uniqueAlias } from "../../utils/unique";

test.describe("UI — dashboard", () => {
  test("loads with the Shortly heading", async ({ page }) => {
    const dash = new DashboardPage(page);
    await dash.goto();
    await expect(page).toHaveTitle(/Shortly/);
  });

  test("create a link, see it listed, and open its analytics", async ({
    page,
  }) => {
    const dash = new DashboardPage(page);
    await dash.goto();

    const alias = uniqueAlias("ui");
    const shortUrl = await dash.createLink("https://example.com/ui-flow", alias);
    expect(shortUrl).toContain(alias);

    // It shows up in the Links table…
    await expect(dash.linkRow(alias)).toBeVisible();

    // …and selecting it renders analytics starting at zero clicks.
    await dash.selectLink(alias);
    await expect(dash.totalClicks).toHaveText("0");
  });

  test("clicks made via the redirect show up in the UI analytics", async ({
    page,
    request,
  }) => {
    const dash = new DashboardPage(page);
    await dash.goto();

    const alias = uniqueAlias("uiclick");
    await dash.createLink("https://example.com/click-flow", alias);

    // Drive 3 real redirects through the API…
    for (let i = 0; i < 3; i++) {
      await request.get(`/${alias}`, { maxRedirects: 0 });
    }

    // …then reload the dashboard and confirm the UI reflects them.
    await dash.goto();
    await dash.selectLink(alias);
    await expect(dash.totalClicks).toHaveText("3");
  });
});
