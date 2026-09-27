import { expect, test } from "@playwright/test";

test("primary actions have sufficient contrast, readable text and keyboard focus", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const cta = page
    .getByRole("main")
    .getByRole("button", { name: "作品をさがす", exact: true });
  const styles = await cta.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      color: style.color,
      background: style.backgroundColor,
      font: parseFloat(style.fontSize),
      height: element.getBoundingClientRect().height,
    };
  });
  const luminance = (rgb: string) => {
    const values = rgb
      .match(/[\d.]+/g)!
      .slice(0, 3)
      .map(Number)
      .map((value) => value / 255)
      .map((value) =>
        value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
      );
    return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
  };
  const colors = [luminance(styles.color), luminance(styles.background)].sort(
    (a, b) => b - a,
  );
  expect((colors[0] + 0.05) / (colors[1] + 0.05)).toBeGreaterThanOrEqual(4.5);
  expect(styles.font).toBeGreaterThanOrEqual(16);
  expect(styles.height).toBeGreaterThanOrEqual(44);
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "本文へスキップ" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
});

test("mobile navigation identifies the current destination and fits the narrow viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  const nav = page.getByRole("navigation", {
    name: "メインメニュー",
    exact: true,
  });
  await nav.getByRole("link", { name: "さがす", exact: true }).click();
  await expect(page).toHaveURL(/\/works$/);
  await expect(
    nav.getByRole("link", { name: "さがす", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  const geometry = await nav.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return {
      bottom: box.bottom,
      viewport: innerHeight,
      width: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
    };
  });
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewport);
  expect(geometry.width).toBeLessThanOrEqual(geometry.viewportWidth);
  for (const link of await nav.getByRole("link").all()) {
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
});

test("a search with no results explains the next action and lets visitors clear it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/works?q=oshinest-no-matching-work-94a827");
  await expect(
    page.getByRole("heading", { name: "条件に合う作品が見つかりませんでした" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "条件をクリアしてさがす" }).click();
  await expect(page).toHaveURL(/\/works\?nuiSize=$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "作品をさがす",
  );
  await expect(page.getByLabel("選択中の条件")).toHaveCount(0);
});
