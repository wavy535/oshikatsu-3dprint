import { expect, type Page } from "@playwright/test";

export async function previewReady(page: Page) {
  await expect(page.getByTestId("design-status")).toHaveText(
    "プレビューを更新しました",
  );
}

export async function showManual(page: Page) {
  const button = page.getByRole("button", { name: "手動で調整", exact: true });
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
}

export async function showChat(page: Page) {
  await page.getByRole("button", { name: "AIで編集", exact: true }).click();
}

export async function showPrintExport(page: Page) {
  await page.getByRole("button", { name: "完成・AR", exact: true }).click();
  const details = page.locator("details").filter({
    has: page.locator("summary", { hasText: "3Dプリント・データ出力" }),
  });
  if (
    !(await details.evaluate((element) => (element as HTMLDetailsElement).open))
  ) {
    await details.locator("summary").click();
  }
}

export async function expectPreviewInViewport(page: Page) {
  await expect(
    page.getByRole("img", { name: /制作物の3Dプレビュー/ }),
  ).toBeInViewport({ ratio: 1 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual((await page.viewportSize())!.width);
}
