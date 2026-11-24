import { expect, test } from "@playwright/test";
import { applyProposal } from "../../src/lib/design/ai-contract";
import { expectPreviewInViewport, previewReady, showChat, showManual } from "./helpers/design";

test.use({ viewport: { width: 390, height: 844 } });

test("anonymous demo uses its own AI route, shows remaining uses and shares edit history", async ({ page }, info) => {
  let calls = 0;
  await page.route("**/api/design/demo/chat", async (route) => {
    calls++;
    const body = route.request().postDataJSON();
    const proposal = { message: "屋根を青くしました。", changes: [{ path: "house.roofColor", value: "#2244cc" }] };
    await route.fulfill({
      headers: { "X-Demo-Remaining": "9" },
      json: { ...proposal, design: applyProposal(body.design, proposal).design, attempts: 1 },
    });
  });
  await page.goto("/demo");
  await previewReady(page);
  await expect(page.getByText(/ログイン不要のAIデモ/)).toBeVisible();
  await expect(page.getByLabel("デモのAI利用枠")).toContainText("あと10回");
  await expectPreviewInViewport(page);
  const cookies = await page.context().cookies();
  expect(cookies.some((cookie) => cookie.name.includes("session_token"))).toBe(false);
  expect(cookies.some((cookie) => cookie.name === "oshinest-ai-demo" && cookie.httpOnly)).toBe(true);
  await page.getByLabel("変えたいところ", { exact: true }).fill("屋根を青くして");
  await page.getByRole("button", { name: "送信して編集" }).click();
  await expect(page.getByRole("log")).toContainText("変更を反映しました");
  await expect(page.getByLabel("デモのAI利用枠")).toContainText("あと9回");
  await expect(page.getByRole("link", { name: "ログインしてAIを使う" })).toHaveCount(0);
  await showManual(page);
  await expect(page.getByLabel("屋根の色", { exact: true })).toHaveValue("#2244cc");
  await page.getByRole("button", { name: "取り消し", exact: true }).click();
  await expect(page.getByLabel("屋根の色", { exact: true })).not.toHaveValue("#2244cc");
  await showChat(page);
  await page.screenshot({ path: info.outputPath("demo-mobile.png") });
  for (const width of [320, 1365]) {
    await page.setViewportSize({ width, height: 900 });
    await expectPreviewInViewport(page);
    await expect(page.getByLabel("変えたいところ", { exact: true })).toBeInViewport({ ratio: 1 });
  }
  expect(calls).toBe(1);
});

test("exhausted demo requests retain the prompt and leave manual editing available", async ({ page }) => {
  await page.route("**/api/design/demo/chat", (route) => route.fulfill({
    status: 429,
    headers: { "X-Demo-Remaining": "0" },
    json: { error: "本日のデモ利用上限に達しました。翌日9時（日本時間）以降にお試しください。" },
  }));
  await page.goto("/demo");
  await previewReady(page);
  await expect(page.getByLabel("デモのAI利用枠")).toContainText("あと10回");
  await page.getByLabel("変えたいところ", { exact: true }).fill("幅を210mmにして");
  await page.getByRole("button", { name: "送信して編集" }).click();
  await expect(page.getByRole("alert")).toContainText("本日のデモ利用上限");
  await expect(page.getByLabel("変えたいところ", { exact: true })).toHaveValue("幅を210mmにして");
  await expect(page.getByRole("button", { name: "送信して編集" })).toBeDisabled();
  await showManual(page);
  const width = page.getByLabel("幅", { exact: true });
  await expect(width).toHaveValue("190");
  await width.fill("210");
  await previewReady(page);
  await expect(page.getByLabel("プレビューと出力")).toContainText("210 × 160 × 175");
});
