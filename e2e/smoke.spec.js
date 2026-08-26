import { test, expect } from "@playwright/test";

/**
 * Smoke tests: verify the app boots and that authentication gating works.
 * Requires a running app with real Clerk keys (see playwright.config.js).
 */
test.describe("smoke", () => {
  test("landing page renders", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.ok()).toBeTruthy();
    await expect(page).toHaveTitle(/.+/);
  });

  test("dashboard is auth-gated", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    // An unauthenticated user must be redirected away from /dashboard.
    expect(page.url()).not.toMatch(/\/dashboard(\/|$)/);
  });
});
