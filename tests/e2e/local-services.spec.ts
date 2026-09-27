import { signInFixture } from "./helpers/auth";
import { randomUUID } from "node:crypto";
import { modelXml, modelZip } from "../helpers/model-files";
import { MODEL_LIMITS } from "../../src/lib/print/limits";
import {
  expect,
  test,
  type Page,
} from "@playwright/test";

test.beforeEach(async ({ baseURL }) => {
  if (!["localhost", "127.0.0.1"].includes(new URL(baseURL!).hostname)) throw new Error("Use local fixtures only");
});

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await signInFixture(page, page.url(), email);
  await page.goto("/");
}

test("the auth HTTP API accepts a request body and persists its session cookie", async ({
  request,
  baseURL,
}) => {
  const signedIn = await request.post("/api/auth/sign-in/email", {
    headers: { origin: baseURL! },
    data: { email: "buyer@example.com", password: "password123" },
  });
  expect(signedIn.status()).toBe(200);
  const session = await request.get("/api/auth/get-session");
  expect(session.status()).toBe(200);
  expect((await session.json()).user.email).toBe("buyer@example.com");
});

test("unverified signup persists a session and keeps creator applications closed", async ({ page }) => {
  const email = `e2e-${randomUUID()}@example.test`;
  await page.goto("/signup");
  await page.getByLabel("表示名", { exact: true }).fill("E2E 会員");
  await page.getByLabel("メールアドレス", { exact: true }).fill(email);
  await page.getByLabel("パスワード", { exact: true }).fill("password123");
  await page.getByLabel("パスワード（確認）", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "会員登録する", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  const session = await page.request.get("/api/auth/get-session");
  expect((await session.json()).user.emailVerified).toBe(false);
  await page.goto("/mypage");
  await expect(page.getByText("E2E 会員", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("E2E 会員", { exact: true })).toBeVisible();
  await page.goto("/creator/apply");
  await expect(page.getByRole("heading", { name: "クリエイター申請は準備中です" })).toBeVisible();
  await expect(page.getByRole("button", { name: "クリエイター申請を送信する" })).toHaveCount(0);
  await page.goto("/studio/works");
  await expect(page).not.toHaveURL(/\/studio\/works$/);
});

test("a buyer places a demo order and can read it after reloading", async ({
  page,
}) => {
  await signIn(page, "buyer@example.com");
  await page.goto("/works");
  await page.locator('a[href^="/works/"]').first().click();
  // Repeated local runs may have consumed the first size's stock.
  await page.locator('a[href*="?size="]').filter({ hasNotText: "在庫なし" }).first().click();
  await page.getByRole("button", { name: "カートに追加", exact: true }).click();
  await expect(
    page.getByText("カートに追加しました。", { exact: false }),
  ).toBeVisible();
  await page.goto("/checkout");
  await page.getByRole("button", { name: "デモ注文を確定する" }).click();
  await expect(page).toHaveURL(/\/checkout\/complete\?order=/);
  await expect(
    page.getByRole("heading", { name: "ご注文ありがとうございます" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "注文詳細を見る" }).click();
  await expect(page).toHaveURL(/\/mypage\/orders\/[\w-]+$/);
  await page.reload();
  await expect(
    page.getByText("デモ注文", { exact: false }).first(),
  ).toBeVisible();
  const orderURL = page.url();
  // A second account must not be able to read this buyer's order.
  await page.context().clearCookies();
  await signIn(page, "creator2@example.com");
  const denied = await page.goto(orderURL);
  expect(denied?.status()).toBe(404);
});

test("a creator recovers from a 3MF limit error, validates 3MF and STL, and stores a thumbnail in R2", async ({
  page,
}) => {
  await signIn(page, "creator@example.com");
  await page.goto("/studio/works");
  await page.getByRole("button", { name: "作品を投稿する" }).click();
  await expect(page).toHaveURL(/\/studio\/works\/[\w-]+\/steps\/1$/);
  const step1 = page.url();
  const oversized = modelZip(modelXml());
  const directory = oversized.readUInt32LE(oversized.length - 6);
  oversized.writeUInt32LE(MODEL_LIMITS.xmlBytes + 1, directory + 24);
  await expect(page.getByRole("button", { name: "印刷用ファイルを選ぶ", exact: true })).toBeEnabled();
  await expect(page.locator('input[type="file"]')).toBeEnabled();
  await page.locator('input[type="file"]').setInputFiles({
    name: "oversized.3mf",
    mimeType: "application/octet-stream",
    buffer: oversized,
  });
  await expect(
    page
      .getByText("3MFの展開後のモデルは64MiBまでです。", { exact: false })
      .first(),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "印刷用ファイルを選ぶ", exact: true })).toBeEnabled();
  await expect(page.locator('input[type="file"]')).toBeEnabled();
  await page.locator('input[type="file"]').setInputFiles({
    name: "tetrahedron.3mf",
    mimeType: "application/octet-stream",
    buffer: modelZip(modelXml()),
  });
  await expect(
    page.getByText("tetrahedron.3mf", { exact: false }).filter({ visible: true }),
  ).toBeVisible();
  await expect(page.getByText("閉じたメッシュ", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "印刷用ファイルを選ぶ", exact: true })).toBeEnabled();
  await page.getByLabel("アップロード方法").selectOption({ index: 1 });
  await expect(page.getByLabel("印刷用ファイル")).toBeEnabled();
  await page.getByLabel("印刷用ファイル").setInputFiles("tests/fixtures/tetrahedron.stl");
  await expect(
    page.getByRole("heading", { name: "自動検証の結果" }),
  ).toBeVisible();
  await expect(
    page.getByText("tetrahedron.stl", { exact: false }).filter({ visible: true }),
  ).toBeVisible();
  await expect(page.getByText("閉じたメッシュ", { exact: true })).toBeVisible();
  await page.goto(step1.replace(/\/1$/, "/4"));
  await expect(page.getByLabel("作品画像", { exact: true })).toBeEnabled();
  await page.getByLabel("作品画像", { exact: true }).setInputFiles({
    name: "thumbnail.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(page.getByText("サムネイル", { exact: true })).toBeVisible();
  const thumbnail = page.locator('img[src^="/api/files/public/work-images/"]');
  await expect(thumbnail).toHaveCount(1);
  await expect
    .poll(() =>
      thumbnail.evaluate(
        (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
      ),
    )
    .toBe(true);
  await page.reload();
  await expect(page.getByText("サムネイル", { exact: true })).toBeVisible();
});


test("multiple print files and images can be published with a converted and cached AR model", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "creator@example.com");
  await page.goto("/studio/works");
  await page.getByRole("button", { name: "作品を投稿する" }).click();
  await expect(page).toHaveURL(/\/steps\/1$/);
  const step1 = page.url();
  const model = modelZip(modelXml());
  await expect(page.getByLabel("印刷用ファイル")).toBeEnabled();
  await page.getByLabel("印刷用ファイル").setInputFiles([
    { name: "seat.3mf", mimeType: "application/octet-stream", buffer: model },
    { name: "legs.3mf", mimeType: "application/octet-stream", buffer: model },
  ]);
  await expect(page.getByRole("heading", { name: "自動検証の結果" })).toHaveCount(2);
  await page.getByRole("link", { name: "印刷指示へ進む", exact: true }).click();
  await expect(page.getByText(/seat\.3mf \/ /).first()).toBeVisible();
  await expect(page.getByText(/legs\.3mf \/ /).first()).toBeVisible();
  await page.goto(step1.replace(/\/1$/, "/4"));
  await expect(page.getByLabel("AR用ファイル", { exact: true })).toBeEnabled();
  await page.getByLabel("AR用ファイル", { exact: true }).setInputFiles({ name: "assembled.3mf", mimeType: "application/octet-stream", buffer: model });
  await expect(page.getByText("登録済み：assembled.3mf")).toBeVisible();
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=", "base64");
  await expect(page.getByLabel("作品画像", { exact: true })).toBeEnabled();
  await page.getByLabel("作品画像", { exact: true }).setInputFiles([
    { name: "front.png", mimeType: "image/png", buffer: png },
    { name: "back.png", mimeType: "image/png", buffer: png },
  ]);
  await expect(page.locator('img[src^="/api/files/public/work-images/"]')).toHaveCount(2);
  await page.reload();
  await expect(page.getByText("登録済み：assembled.3mf")).toBeVisible();
  await page.goto(step1);
  await expect(page.getByRole("heading", { name: "自動検証の結果" })).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.goto(step1.replace(/\/1$/, "/3"));
  await page.getByLabel("作品名", { exact: true }).fill("Cloudflare ローカル動作確認");
  await page.getByLabel("説明", { exact: true }).fill("ローカル試験用。販売・発送しません。");
  const row = page.locator("tbody tr").filter({ has: page.getByLabel("15cmを出品する", { exact: true }) });
  await row.locator('input[type="number"]').nth(0).fill("1000");
  await row.locator('input[type="number"]').nth(1).fill("1");
  await page.getByLabel("15cmを出品する", { exact: true }).check();
  await page.getByRole("button", { name: "公開の設定へ進む", exact: true }).click();
  await expect(page).toHaveURL(/\/steps\/4$/);
  await page.getByRole("button", { name: "公開する", exact: true }).click();
  await expect(page).toHaveURL(/\/works\/[\w-]+$/);
  try {
    const converted = page.waitForResponse((response) => new URL(response.url()).pathname.startsWith("/api/ar/works/") && response.url().includes(".glb?"));
    await page.getByRole("button", { name: "開く", exact: true }).click();
    const viewer = page.locator("model-viewer");
    await expect(viewer).toBeVisible();
    const source = await viewer.evaluate((element) => (element as HTMLElement & { src: string }).src);
    expect((await converted).status()).toBe(307);
    const model = await page.request.get(source);
    expect(model.status()).toBe(200);
    expect(model.headers()["content-type"]).toBe("model/gltf-binary");
    const bytes = await model.body();
    expect(bytes.readUInt32LE(0)).toBe(0x46546c67);
    const cached = await page.request.get(source);
    expect(cached.status()).toBe(200);
    expect(await cached.body()).toEqual(bytes);
    const usdz = await page.request.get(source.replace(".glb?", ".usdz?"));
    expect(usdz.status()).toBe(200);
    expect(usdz.headers()["content-type"]).toBe("model/vnd.usdz+zip");
  } finally {
    await page.goto(step1.replace(/\/1$/, "/3"));
    await page.getByLabel("15cmを出品する", { exact: true }).uncheck();
    await page.getByRole("button", { name: "公開の設定へ進む", exact: true }).click();
    await expect(page).toHaveURL(/\/steps\/4$/);
  }
});
