import { signInFixture } from "./helpers/auth";
import { randomInt, randomUUID } from "node:crypto";
import { modelXml, modelZip } from "../helpers/model-files";
import { MODEL_LIMITS } from "../../src/lib/print/limits";
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

const mailpit = process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:58025";

test.beforeEach(async ({ baseURL }) => {
  // These flows create demo accounts, orders and drafts using the local fixtures.
  for (const value of [baseURL!, mailpit]) {
    if (!["localhost", "127.0.0.1"].includes(new URL(value).hostname)) {
      throw new Error("Run these tests against local services only");
    }
  }
});

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await signInFixture(page, page.url(), email);
  await page.goto("/");
}

async function deliveredCode(
  request: APIRequestContext,
  recipient: string,
  subject: string,
) {
  let code = "";
  await expect
    .poll(async () => {
      const response = await request.get(`${mailpit}/api/v1/messages`);
      const { messages } = (await response.json()) as {
        messages: { ID: string; Subject: string; To: { Address: string }[] }[];
      };
      const message = messages.find(
        (m) =>
          m.Subject === subject && m.To.some((to) => to.Address === recipient),
      );
      if (!message) return false;
      const detail = await (
        await request.get(`${mailpit}/api/v1/message/${message.ID}`)
      ).json();
      code = String(detail.Text).match(/\b\d{6}\b/)?.[0] ?? "";
      return code.length === 6;
    })
    .toBe(true);
  return code;
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

test("email verification creates a persistent session; SMS verifies the signed-in account", async ({
  page,
  request,
}) => {
  const email = `e2e-${randomUUID()}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("表示名", { exact: true }).fill("E2E 会員");
  await page.getByLabel("メールアドレス", { exact: true }).fill(email);
  await page.getByLabel("パスワード", { exact: true }).fill("password123");
  await page
    .getByLabel("パスワード（確認）", { exact: true })
    .fill("password123");
  await page
    .getByRole("button", { name: "確認コードを送る", exact: true })
    .click();
  await expect(page).toHaveURL(/\/signup\/verify\?/);
  await page
    .getByLabel("確認コード 1文字目")
    .fill(await deliveredCode(request, email, "OshiNest 確認コード"));
  await page.getByRole("button", { name: "登録を完了する" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/mypage");
  await expect(
    page.getByText("表示名：E2E 会員", { exact: true }),
  ).toBeVisible();

  await page.goto("/creator/apply");
  const phone = `090${String(randomInt(100_000_000)).padStart(8, "0")}`;
  await page.getByLabel("携帯電話の番号").fill(phone);
  await page
    .getByRole("button", { name: "認証コードを送る", exact: true })
    .click();
  await expect(page.getByLabel("認証コード 1文字目")).toBeVisible();
  const code = await deliveredCode(
    request,
    "sms@oshinest.local",
    `SMS +81${phone.slice(1)}`,
  );
  // Server Actions must pass through the same rate limiter as the auth HTTP API.
  await page
    .getByRole("button", { name: "コードを再送する", exact: true })
    .click();
  await expect(
    page.getByText(
      "送信の間隔が短すぎます。1分ほど待ってからもう一度お試しください",
    ),
  ).toBeVisible();
  await page.getByLabel("認証コード 1文字目").fill(code);
  await page.getByRole("button", { name: "認証する", exact: true }).click();
  await expect(page.getByText("認証済み", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("認証済み", { exact: true })).toBeVisible();
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

test("a creator recovers from a 3MF limit error, validates 3MF and STL, and stores a thumbnail in S3", async ({
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
  await page.getByLabel("印刷用ファイル").setInputFiles("tests/fixtures/tetrahedron.stl");
  await expect(
    page.getByRole("heading", { name: "自動検証の結果" }),
  ).toBeVisible();
  await expect(
    page.getByText("tetrahedron.stl", { exact: false }).filter({ visible: true }),
  ).toBeVisible();
  await expect(page.getByText("閉じたメッシュ", { exact: true })).toBeVisible();
  await page.goto(step1.replace(/\/1$/, "/4"));
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


test("multiple print files, an independent AR model and multiple images can be posted to one work", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "creator@example.com");
  await page.goto("/studio/works");
  await page.getByRole("button", { name: "作品を投稿する" }).click();
  await expect(page).toHaveURL(/\/steps\/1$/);
  const step1 = page.url();
  const model = modelZip(modelXml());
  await page.getByLabel("印刷用ファイル").setInputFiles([
    { name: "seat.3mf", mimeType: "application/octet-stream", buffer: model },
    { name: "legs.3mf", mimeType: "application/octet-stream", buffer: model },
  ]);
  await expect(page.getByRole("heading", { name: "自動検証の結果" })).toHaveCount(2);
  await page.getByRole("link", { name: "印刷指示へ進む", exact: true }).click();
  await expect(page.getByText(/seat\.3mf \/ /).first()).toBeVisible();
  await expect(page.getByText(/legs\.3mf \/ /).first()).toBeVisible();
  await page.goto(step1.replace(/\/1$/, "/4"));
  await page.getByLabel("AR用ファイル", { exact: true }).setInputFiles({ name: "assembled.3mf", mimeType: "application/octet-stream", buffer: model });
  await expect(page.getByText("登録済み：assembled.3mf")).toBeVisible();
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=", "base64");
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
});
