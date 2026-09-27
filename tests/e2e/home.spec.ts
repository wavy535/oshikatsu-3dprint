import { expect, test } from "@playwright/test";

for (const javaScriptEnabled of [true, false]) {
  test(`home search combines filters on mobile (JavaScript ${javaScriptEnabled ? "on" : "off"})`, async ({ browser, baseURL }) => {
    const context = await browser.newContext({
      baseURL,
      javaScriptEnabled,
      viewport: { width: 320, height: 740 },
    });
    try {
      const page = await context.newPage();
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toContainText("おうちと家具。");
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);

      const search = page.getByRole("search", { name: "サイズとカテゴリから作品を探す" });
      await search.getByLabel("ぬいの身長").selectOption("15");
      await search.getByLabel("探しているもの").selectOption("kagu");
      await search.getByRole("button", { name: "作品をさがす" }).click();
      await expect(page).toHaveURL(/\/works\?nuiSize=15&category=kagu$/);
      const filters = page.getByLabel("選択中の条件");
      await expect(filters.getByRole("link", { name: "15cmの条件を解除" })).toBeVisible();
      await expect(filters.getByRole("link", { name: "家具の条件を解除" })).toBeVisible();

      // A fresh visit starts with an unrestricted search; no stale form selection.
      await page.goto("/");
      await search.getByRole("button", { name: "作品をさがす" }).click();
      await expect(page).toHaveURL(/\/works\?nuiSize=&category=$/);
      await expect(page.getByLabel("選択中の条件")).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
}
