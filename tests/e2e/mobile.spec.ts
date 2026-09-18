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
    const orders = page.getByRole("link", { name: "購入履歴", exact: true });
    await expect(orders).not.toBeVisible();
    await menu.press("Enter");
    await expect(orders).toBeVisible();
    await expectNoOverflow(page);
    await orders.click();
    await expect(page).toHaveURL(/\/mypage\/orders$/);
    await expectNoOverflow(page);

    if (role === "admin") {
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

test("verification inputs fit and remain readable on a narrow phone", async ({ page }) => {
  await page.goto("/signup/verify?email=mobile%40example.com");
  const first = page.getByLabel("確認コード 1文字目");
  await first.fill("123456");
  await expect(page.getByLabel("確認コード 6文字目")).toHaveValue("6");
  expect(await first.evaluate((input) => parseFloat(getComputedStyle(input).fontSize))).toBeGreaterThanOrEqual(16);
  await expectNoOverflow(page);
});
