import { signInFixture } from "./helpers/auth";
import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true });

test.beforeEach(async ({ baseURL }) => {
  if (!["localhost", "127.0.0.1"].includes(new URL(baseURL!).hostname)) {
    throw new Error("Run mobile checks against local fixtures only");
  }
});

async function expectNoOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(widths.content).toBeLessThanOrEqual(widths.viewport + 1);
}

for (const role of ["buyer", "creator", "admin"]) {
  test(`${role} can navigate on a narrow phone`, async ({ page, baseURL }) => {
    await signInFixture(page, baseURL!, `${role}@example.com`);
    await page.goto("/mypage");
    const menu = page.locator("summary", { hasText: "マイページメニュー" });
    const orders = page.locator("details").getByRole("link", { name: "購入履歴", exact: true });
    await expect(orders).not.toBeVisible();
    await menu.press("Enter");
    await expect(orders).toBeVisible();
    await expectNoOverflow(page);
    await orders.click();
    await expect(page).toHaveURL(/\/mypage\/orders$/);
    await expectNoOverflow(page);

    if (role === "admin") {
      await page.getByRole("navigation", { name: "メインメニュー", exact: true }).getByRole("link", { name: "マイページ", exact: true }).click();
      await page.getByRole("link", { name: "運営コンソール", exact: true }).click();
      const nav = page.getByRole("navigation", { name: "運営メニュー" });
      await nav.getByRole("link", { name: "払込管理", exact: true }).click();
      await expect(page).toHaveURL(/\/admin\/payouts$/);
      await expectNoOverflow(page);
      await expect(page.locator("table")).toBeVisible();
      const scroll = await page.locator("table").evaluate((table) => {
        const container = table.parentElement!;
        container.scrollLeft = 100;
        return container.scrollLeft;
      });
      expect(scroll).toBeGreaterThan(0);
    }
  });
}

test("filters are usable on mobile and expanded on desktop", async ({ page }) => {
  await page.goto("/works");
  const filters = page.locator("summary", { hasText: "作品を絞り込む" });
  await filters.click();
  await page.locator("details").getByRole("link", { name: "15cm", exact: true }).click();
  await expect(page).toHaveURL(/nuiSize=15/);
  await expectNoOverflow(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(filters).toBeHidden();
  await expect(page.getByRole("link", { name: "15cm", exact: true })).toBeVisible();
  await expectNoOverflow(page);
});

test("signup remains usable on a narrow phone and verification redirects to login", async ({ page }) => {
  await page.goto("/signup/verify?email=mobile%40example.com");
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/signup");
  await expect(page.getByRole("button", { name: "会員登録する", exact: true })).toBeVisible();
  await expectNoOverflow(page);
});
