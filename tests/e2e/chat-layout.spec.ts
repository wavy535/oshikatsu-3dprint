import { expect, test, type Page } from "@playwright/test";
import { signInFixture } from "./helpers/auth";
import { expectPreviewInViewport, previewReady } from "./helpers/design";

test.use({ isMobile: true, hasTouch: true });

async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual((await page.viewportSize())!.width);
}

async function expectConversationSpace(page: Page, height: number) {
  await expect.poll(async () => (await page.getByRole("log").boundingBox())?.height ?? 0)
    .toBeGreaterThanOrEqual(height);
  await expect(page.getByLabel("変えたいところ", { exact: true })).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole("button", { name: "送信して編集" })).toBeInViewport({ ratio: 1 });
  await expectPreviewInViewport(page);
  await expectNoOverflow(page);
}

for (const path of ["/create", "/demo"]) {
  test(`${path} keeps the conversation and composer usable on phones and desktop`, async ({ page }, info) => {
    await page.route("**/api/design/demo", (route) => route.fulfill({
      json: { remaining: 30, globalRemaining: 100, resetAt: Date.now() + 3_600_000 },
    }));
    await page.goto(path);
    await previewReady(page);

    for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 1365, height: 900 }]) {
      await page.setViewportSize(viewport);
      await expect.poll(() => page.getByTestId("design-workspace").evaluate((el) =>
        Math.round(el.getBoundingClientRect().bottom),
      )).toBe(viewport.height);
      await expectConversationSpace(page, 80);
      await page.screenshot({ path: info.outputPath(`${viewport.width}x${viewport.height}.png`) });
    }
  });

  test(`${path} follows the keyboard viewport and scrolls long replies without losing send controls`, async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route("**/api/design/demo", (route) => route.fulfill({
      json: { remaining: 30, globalRemaining: 100, resetAt: Date.now() + 3_600_000 },
    }));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    await page.route(path === "/demo" ? "**/api/design/demo/chat" : "**/api/design/chat", async (route) => {
      await gate;
      const body = route.request().postDataJSON();
      await route.fulfill({
        json: {
          message: "屋根の色や形を一緒に相談できます。\n".repeat(30) + "https://example.com/" + "a".repeat(200) + "\n続けて相談できます。",
          changes: [], design: body.design, attempts: 1,
        },
      });
    });
    await page.goto(path);
    await previewReady(page);
    const input = page.getByLabel("変えたいところ", { exact: true });
    await expect(input).toBeEnabled();
    await input.fill("屋根の色を相談したい");
    // Safari can keep the layout viewport tall while the keyboard shrinks this viewport.
    await page.evaluate(() => {
      Object.defineProperty(window.visualViewport, "height", { configurable: true, value: 400 });
      window.visualViewport!.dispatchEvent(new Event("resize"));
    });
    await expect.poll(() => page.getByTestId("design-workspace").evaluate((el) =>
      Math.round(el.getBoundingClientRect().bottom),
    )).toBe(400);
    await expectConversationSpace(page, 64);
    await page.getByRole("button", { name: "送信して編集" }).click();
    await expect(page.getByRole("button", { name: "中止", exact: true })).toBeInViewport({ ratio: 1 });
    release();
    await expect(page.getByRole("article", { name: "OshiNestのメッセージ" })).toContainText("続けて相談できます。");
    await expectConversationSpace(page, 64);
    const scroll = await page.getByRole("log").evaluate((el) => ({
      height: el.clientHeight, content: el.scrollHeight, bottom: el.scrollHeight - el.scrollTop - el.clientHeight,
    }));
    expect(scroll.content).toBeGreaterThan(scroll.height);
    expect(scroll.bottom).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath("keyboard.png") });

    await page.evaluate(() => {
      Reflect.deleteProperty(window.visualViewport!, "height");
      window.visualViewport!.dispatchEvent(new Event("resize"));
    });
    await input.blur();
    await expect(page.getByRole("button", { name: "完成・ARへ", exact: true })).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole("navigation", { name: "メインメニュー", exact: true })).toBeVisible();
    await page.setViewportSize({ width: 844, height: 390 });
    await input.focus();
    await expectConversationSpace(page, 24);
  });
}

test("mobile messages open the conversation with a way back to the filtered list", async ({ page, baseURL }, info) => {
  await signInFixture(page, baseURL!, "buyer@example.com");
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/mypage/messages?with=admin&filter=unread");
  const list = page.getByRole("complementary", { name: "相手とのやりとり一覧" });
  const conversation = page.getByRole("region", { name: "相手との会話", exact: true });
  await expect(list).toBeHidden();
  await expect(conversation).toBeVisible();
  const back = page.getByRole("link", { name: "やりとり一覧に戻る" });
  await expect(back).toHaveAttribute("href", "/mypage/messages?filter=unread");
  const input = page.getByRole("textbox", { name: "メッセージを入力" });
  await input.fill("長いメッセージの入力を確認します。".repeat(80));
  await expectNoOverflow(page);
  await page.getByRole("button", { name: "送信", exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "送信", exact: true })).toBeInViewport({ ratio: 1 });
  await page.getByRole("button", { name: "送信", exact: true }).click({ trial: true });
  await page.screenshot({ path: info.outputPath("messages-mobile.png") });

  await page.setViewportSize({ width: 1365, height: 900 });
  await expect(list).toBeVisible();
  await expect(conversation).toBeVisible();
  await expect(back).toBeHidden();
  await expectNoOverflow(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await back.click();
  await expect(page).toHaveURL(/\/mypage\/messages\?filter=unread$/);
  await expect(list).toBeVisible();
});
