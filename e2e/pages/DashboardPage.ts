import { Page, Locator, expect } from "@playwright/test";

/**
 * Page Object for the Shortly dashboard (the built SPA at :5050).
 * Selectors use data-testid hooks added to the React components.
 */
export class DashboardPage {
  readonly page: Page;
  readonly urlInput: Locator;
  readonly aliasInput: Locator;
  readonly shortenButton: Locator;
  readonly resultShortUrl: Locator;
  readonly createError: Locator;
  readonly totalClicks: Locator;
  readonly last30Days: Locator;
  readonly timelineChart: Locator;
  readonly topReferrers: Locator;

  constructor(page: Page) {
    this.page = page;
    this.urlInput = page.getByTestId("create-url");
    this.aliasInput = page.getByTestId("create-alias");
    this.shortenButton = page.getByRole("button", { name: "Shorten" });
    this.resultShortUrl = page.getByTestId("result-short-url");
    this.createError = page.getByTestId("create-error");
    this.totalClicks = page.getByTestId("total-clicks");
    this.last30Days = page.getByTestId("last-30-days");
    this.timelineChart = page.getByRole("img", { name: "Clicks per day" });
    this.topReferrers = page.getByTestId("top-referrers");
  }

  /** Fill the form and submit without waiting for success (for invalid inputs). */
  async attemptCreate(url: string, alias?: string): Promise<void> {
    await this.urlInput.fill(url);
    if (alias) await this.aliasInput.fill(alias);
    await this.shortenButton.click();
  }

  // ---- Links table cells (scoped to a given code's row) ----
  linkCode(code: string): Locator {
    return this.linkRow(code).getByTestId("link-code");
  }
  linkDest(code: string): Locator {
    return this.linkRow(code).getByTestId("link-dest");
  }
  linkClicks(code: string): Locator {
    return this.linkRow(code).getByTestId("link-clicks");
  }
  linkCreated(code: string): Locator {
    return this.linkRow(code).getByTestId("link-created");
  }
  referrerRows(): Locator {
    return this.topReferrers.getByTestId("referrer-row");
  }

  async goto(): Promise<void> {
    await this.page.goto("/");
    await expect(
      this.page.getByRole("heading", { name: /Shortly/ }),
    ).toBeVisible();
  }

  /** Fill the form, submit, and return the short URL shown in the result. */
  async createLink(url: string, alias?: string): Promise<string> {
    await this.urlInput.fill(url);
    if (alias) await this.aliasInput.fill(alias);
    await this.shortenButton.click();
    await expect(this.resultShortUrl).toBeVisible();
    return (await this.resultShortUrl.textContent())?.trim() ?? "";
  }

  /** The row in the Links table for a given code. */
  linkRow(code: string): Locator {
    return this.page.getByTestId("link-row").filter({ hasText: code });
  }

  /** Select a link and wait for its analytics to render. */
  async selectLink(code: string): Promise<void> {
    await this.linkRow(code).click();
    await expect(this.totalClicks).toBeVisible();
  }
}
