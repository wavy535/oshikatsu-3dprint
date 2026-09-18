import { expect, test } from "@playwright/test";

test.skip(process.env.E2E_GUEST !== "true", "Run against the isolated guest deployment");

test("guests enter without credentials, post works, remain isolated and cannot become admins", async ({ page, browser, baseURL }) => {
  await page.goto("/studio/works");
  await expect(page.getByLabel("パスワード", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "ゲストで始める", exact: true }).click();
  await expect(page).toHaveURL(/\/studio\/works$/);
  const session = await (await page.request.get("/api/auth/get-session")).json();
  expect(session.user.isAnonymous).toBe(true);
  await page.getByRole("button", { name: "作品を投稿する" }).click();
  await expect(page).toHaveURL(/\/steps\/1$/);
  const draft = page.url();
  await page.getByLabel("印刷用ファイル").setInputFiles("tests/fixtures/tetrahedron.stl");
  await expect(page.getByRole("heading", { name: "自動検証の結果" })).toBeVisible();
  await page.reload();
  expect((await (await page.request.get("/api/auth/get-session")).json()).user.id).toBe(session.user.id);
  expect((await page.goto("/admin/print-queue"))?.status()).toBe(404);
  const another = await browser.newContext({ baseURL });
  try {
    const other = await another.newPage();
    await other.goto("/login");
    await other.getByRole("button", { name: "ゲストで始める", exact: true }).click();
    await expect(other).toHaveURL(/\/$/);
    const otherSession = await (await other.request.get("/api/auth/get-session")).json();
    expect(otherSession.user.id).not.toBe(session.user.id);
    expect((await other.goto(draft))?.status()).toBe(404);
    const response = await other.request.post("/api/auth/sign-up/email", {
      headers: { origin: baseURL! }, data: { email: "guest-test@example.invalid", name: "Test", password: "unused-password" },
    });
    expect(response.status()).toBe(403);
  } finally { await another.close(); }
});

test("a guest publishes separate print and AR files and another guest places a demo purchase", async ({ page, browser, baseURL }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/studio/works");
  await page.getByRole("button", { name: "ゲストで始める", exact: true }).click();
  await page.getByRole("button", { name: "作品を投稿する" }).click();
  await expect(page).toHaveURL(/\/steps\/1$/);
  const draft = page.url();
  const workId = draft.match(/\/works\/([^/]+)\//)![1];
  await page.getByLabel("印刷用ファイル").setInputFiles("tests/fixtures/tetrahedron.stl");
  await expect(page.getByRole("heading", { name: "自動検証の結果" })).toBeVisible();
  await page.goto(draft.replace(/\/1$/, "/3"));
  await page.getByLabel("作品名", { exact: true }).fill("配備確認用サンプル（テスト）");
  await page.getByLabel("説明", { exact: true }).fill("自動動作確認用の四面体モデルです。実際の販売・発送はありません。");
  const row = page.locator("tbody tr").filter({ has: page.getByLabel("15cmを出品する", { exact: true }) });
  await row.locator('input[type="number"]').nth(0).fill("1000");
  await row.locator('input[type="number"]').nth(1).fill("1");
  await page.getByLabel("15cmを出品する", { exact: true }).check();
  await page.getByRole("button", { name: "公開の設定へ進む", exact: true }).click();
  await expect(page).toHaveURL(/\/steps\/4$/);
  await page.getByLabel("AR用ファイル", { exact: true }).setInputFiles("tests/fixtures/tetrahedron.stl");
  await expect(page.getByText("登録済み：tetrahedron.stl")).toBeVisible();
  await page.getByLabel("作品画像", { exact: true }).setInputFiles({ name: "test.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=", "base64") });
  await expect(page.locator('img[src^="/api/files/public/work-images/"]')).toHaveCount(1);
  await page.getByRole("button", { name: "公開する", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/works/${workId}$`));
  const buyer = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  try {
    const other = await buyer.newPage();
    await other.goto("/login");
    await other.getByRole("button", { name: "ゲストで始める", exact: true }).click();
    await expect(other).toHaveURL(/\/$/);
    await other.goto(`/works/${workId}`);
    await other.getByRole("button", { name: "開く", exact: true }).click();
    const viewer = other.locator("model-viewer");
    await expect(viewer).toBeVisible();
    const src = await viewer.evaluate(element => (element as HTMLElement & { src: string }).src);
    const ar = await other.request.get(src);
    expect(ar.ok()).toBe(true);
    expect(ar.headers()["content-type"]).toContain("model/gltf-binary");
    await other.getByRole("button", { name: "カートに追加", exact: true }).click();
    await expect(other.getByText("カートに追加しました。", { exact: false })).toBeVisible();
    await other.goto("/mypage/addresses");
    await other.getByRole("button", { name: "配送先を追加", exact: true }).click();
    for (const [label, value] of [["お名前","配備テスト"],["郵便番号","1000001"],["都道府県","東京都"],["市区町村","テスト市"],["番地・建物名","動作確認用・発送不可"],["電話番号","09000000000"]]) {
      await other.getByLabel(label, { exact: true }).fill(value);
    }
    await other.getByRole("button", { name: "保存する", exact: true }).click();
    await expect(other.getByRole("button", { name: "配送先を追加", exact: true })).toBeVisible();
    await other.goto("/checkout");
    await other.getByRole("button", { name: "デモ注文を確定する", exact: true }).click();
    await expect(other).toHaveURL(/\/checkout\/complete\?order=/);
    await expect(other.getByRole("heading", { name: "ご注文ありがとうございます" })).toBeVisible();
  } finally {
    await buyer.close();
    // Stop listing the synthetic test model after validation.
    await page.goto(draft.replace(/\/1$/, "/3"));
    await page.getByLabel("15cmを出品する", { exact: true }).uncheck();
    await page.getByRole("button", { name: "公開の設定へ進む", exact: true }).click();
    await expect(page).toHaveURL(/\/steps\/4$/);
  }
});
