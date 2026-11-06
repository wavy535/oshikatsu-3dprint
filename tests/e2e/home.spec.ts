import { expect, test } from "@playwright/test";
import { expectPreviewInViewport, previewReady } from "./helpers/design";

for (const javaScriptEnabled of [true, false]) {
  test(`home opens creation directly and keeps browsing accessible (JavaScript ${javaScriptEnabled ? "on" : "off"})`, async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({
      baseURL,
      javaScriptEnabled,
      viewport: { width: 320, height: 740 },
    });
    try {
      const page = await context.newPage();
      await page.goto("/");
      await expect(page).toHaveURL(/\/create$/);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "AIでつくる",
      );
      if (javaScriptEnabled) {
        await previewReady(page);
        await expectPreviewInViewport(page);
        await expect(
          page.getByLabel("変えたいところ", { exact: true }),
        ).toBeInViewport({ ratio: 1 });
        await page
          .getByRole("button", { name: "完成・ARへ", exact: true })
          .click();
        await expect(
          page.getByRole("button", { name: "ARで確認", exact: true }),
        ).toBeVisible();
      } else {
        await expect(page.locator("noscript p")).toBeVisible();
        await expect(page.locator("noscript p")).toContainText(
          "制作にはJavaScriptが必要です。",
        );
      }
      const nav = page.getByRole("navigation", {
        name: "メインメニュー",
        exact: true,
      });
      await expect(nav.getByRole("link")).toHaveCount(3);
      await nav.getByRole("link", { name: "さがす", exact: true }).click();
      await expect(page).toHaveURL(/\/works$/);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "作品をさがす",
      );
    } finally {
      await context.close();
    }
  });
}
