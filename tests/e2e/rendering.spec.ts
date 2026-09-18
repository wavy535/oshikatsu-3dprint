import { signInFixture } from "./helpers/auth";
import { expect, test } from "@playwright/test";

test("AR loads on demand, reserves space, and clears errors when switching models", async ({ page, baseURL }) => {
  if (!["localhost", "127.0.0.1"].includes(new URL(baseURL!).hostname)) throw new Error("Use local fixtures");
  await signInFixture(page, baseURL!, "buyer@example.com");
  const modelRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/ar/")) modelRequests.push(request.url());
  });
  await page.goto("/works");
  const href = await page.locator('a[href^="/works/"]').first().getAttribute("href");
  expect(href).toBeTruthy();
  await page.goto(href!);
  const open = page.getByRole("button", { name: "開く", exact: true });
  await expect(open).toBeVisible();
  expect(await page.evaluate(() => Boolean(customElements.get("model-viewer")))).toBe(false);
  expect(modelRequests).toEqual([]);

  // Delay newly imported scripts to exercise the loading state on a slow connection.
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/_next/static/**/*.js", async (route) => { await gate; await route.continue(); });
  try {
    await open.click();
    const loading = page.getByRole("status").filter({ hasText: "3D表示を準備しています" });
    await expect(loading).toBeVisible();
    expect((await loading.boundingBox())!.height).toBe(256);
  } finally {
    release();
  }
  const viewer = page.locator("model-viewer");
  await expect(viewer).toBeVisible();
  expect((await viewer.boundingBox())!.height).toBe(256);
  await expect.poll(() => modelRequests.length).toBeGreaterThan(0);
  await page.unroute("**/_next/static/**/*.js");
  const previousSource = await viewer.evaluate((element) => (element as HTMLElement & { src: string }).src);
  await viewer.dispatchEvent("error");
  await expect(page.getByRole("alert").filter({ hasText: "このモデルを表示できませんでした" })).toBeVisible();
  await page.getByRole("button", { name: "仮の部屋（奥＋左）", exact: true }).click();
  expect(previousSource).toBeTruthy();
  await expect.poll(() => viewer.evaluate((element) => (element as HTMLElement & { src: string }).src)).not.toBe(previousSource);
  await expect(page.getByRole("alert").filter({ hasText: "このモデルを表示できませんでした" })).toBeHidden();
});
