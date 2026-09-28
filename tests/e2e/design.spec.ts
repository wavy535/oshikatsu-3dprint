import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";

test.use({ viewport: { width: 390, height: 844 } });
async function ready(page: import("@playwright/test").Page) {
  await expect(page.getByTestId("design-status")).toHaveText("プレビューを更新しました");
  await expect(page.getByRole("button", { name: "印刷用3MFを保存" })).toBeEnabled();
}

test("edit, undo, local restore and 3MF export use the same design on mobile", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/create");
  await ready(page);
  await expect(page.getByRole("img", { name: /おうちの3Dプレビュー/ })).toBeVisible();
  await page.getByRole("button", { name: "視点を戻す" }).click();
  await page.screenshot({ path: testInfo.outputPath("editor-mobile.png") });
  await page.getByLabel("幅", { exact: true }).fill("210");
  await page.getByLabel("幅", { exact: true }).press("Tab");
  await ready(page);
  await page.getByRole("button", { name: "取り消し", exact: true }).click();
  await expect(page.getByLabel("幅", { exact: true })).toHaveValue("190");
  await page.getByRole("button", { name: "やり直し", exact: true }).click();
  await expect(page.getByLabel("幅", { exact: true })).toHaveValue("210");
  await page.getByLabel("棚を置く").check();
  await ready(page);
  await expect(page.getByLabel("部品一覧").getByRole("button", { name: "棚", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "この端末に保存", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "この端末に保存しました" })).toBeVisible();
  await page.reload();
  await page.getByText("設計を開く・ファイルに保存", { exact: true }).click();
  await page.getByRole("button", { name: "保存した設計を開く" }).click();
  await expect(page.getByLabel("幅", { exact: true })).toHaveValue("210");
  await expect(page.getByLabel("棚を置く")).toBeChecked();
  await ready(page);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "印刷用3MFを保存" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("oshinest-parts.zip");
  const files = unzipSync(await readFile((await download.path())!));
  expect(Object.keys(files).filter((p) => p.endsWith(".3mf"))).toHaveLength(7);
  expect(JSON.parse(strFromU8(files["design.oshinest.json"])).house.width).toBe(210);
  await page.getByRole("button", { name: "ARで確認", exact: true }).click();
  // React 19 assigns existing custom-element properties, not necessarily attributes.
  await expect.poll(() => page.locator("model-viewer").evaluate((el) => (el as HTMLElement & { src: string }).src)).toMatch(/^blob:/);
  await expect(page.locator("model-viewer")).toHaveAttribute("ios-src", /^blob:/);
  await expect.poll(() => page.locator("model-viewer").evaluate((el) => (el as HTMLElement & { loaded: boolean }).loaded)).toBe(true);
  await page.getByLabel("幅", { exact: true }).fill("220");
  await page.getByLabel("幅", { exact: true }).press("Tab");
  await expect(page.locator("model-viewer")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
});

test("invalid imports preserve the design; manufacturing checks block only print export", async ({ page }) => {
  await page.goto("/create");
  await ready(page);
  await page.getByText("設計を開く・ファイルに保存", { exact: true }).click();
  await page.getByLabel("設計ファイル", { exact: true }).setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from('{"version":99}') });
  await expect(page.getByRole("alert")).toContainText("対応範囲外");
  await expect(page.getByLabel("幅", { exact: true })).toHaveValue("190");
  await page.getByLabel("窓の幅", { exact: true }).fill("190");
  await page.getByLabel("窓の幅", { exact: true }).press("Tab");
  await expect(page.getByRole("alert")).toContainText("窓の周囲");
  await expect(page.getByLabel("窓の幅", { exact: true })).toHaveValue("55");
  await page.getByLabel("板厚", { exact: true }).fill("1");
  await page.getByLabel("板厚", { exact: true }).press("Tab");
  await expect(page.getByText(/要修正：板厚/)).toBeVisible();
  await expect(page.getByRole("button", { name: "印刷用3MFを保存" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "GLBを保存" })).toBeEnabled();
});

test("320px layout and editing after going offline", async ({ page, context }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/create");
  await ready(page);
  await context.setOffline(true);
  try {
    await page.getByLabel("屋根の立ち上がり").fill("0");
    await page.getByLabel("屋根の立ち上がり").press("Tab");
    await ready(page);
    await expect(page.getByLabel("部品一覧").getByRole("button", { name: "平らな屋根" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    const file = page.waitForEvent("download");
    await page.getByText("設計を開く・ファイルに保存", { exact: true }).click();
    await page.getByRole("button", { name: "設計ファイルを保存", exact: true }).click();
    expect((await file).suggestedFilename()).toBe("house.oshinest.json");
  } finally { await context.setOffline(false); }
});

test("desktop preview and measured editing latency with 4x CPU slowdown", async ({ page, context }, testInfo) => {
  await page.setViewportSize({ width: 1365, height: 900 });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.goto("/create");
  await ready(page);
  await expect(page.getByRole("img", { name: /おうちの3Dプレビュー/ })).toBeVisible();
  await expect.poll(() => page.getByRole("img", { name: /おうちの3Dプレビュー/ }).evaluate((el) => el.parentElement!.clientHeight)).toBe(480);
  const times: number[] = [];
  for (let i = 0; i < 20; i++) {
    await page.getByLabel("幅", { exact: true }).fill(String(190 + i * 2));
    const start = await page.evaluate(() => performance.now());
    await page.getByLabel("幅", { exact: true }).press("Tab");
    await ready(page);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    times.push(await page.evaluate(() => performance.now()) - start);
  }
  const sorted = times.toSorted((a, b) => a - b);
  await testInfo.attach("editing-latency.json", { body: JSON.stringify({ cpuSlowdown: 4, localNetwork: true, iterations: times.length, medianMs: sorted[10], p95Ms: sorted[18], times }), contentType: "application/json" });
  console.log("Editor latency (4x CPU, localhost):", JSON.stringify({ medianMs: sorted[10], p95Ms: sorted[18] }));
  await page.getByRole("button", { name: "視点を戻す" }).click();
  await page.screenshot({ path: testInfo.outputPath("editor-desktop.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1365);
});

test("home does not download the modelling engine until entering the editor", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(requests.some((url) => /manifold|geometry\.worker/.test(url))).toBe(false);
  await page.getByRole("navigation", { name: "メインメニュー", exact: true }).getByRole("link", { name: "つくる", exact: true }).click();
  await ready(page);
  expect(requests.some((url) => url.includes(".wasm"))).toBe(true);
});

test("failed WASM load can be retried without discarding edits", async ({ page }) => {
  await page.route("**/*.wasm", (route) => route.abort());
  await page.goto("/create");
  await expect(page.getByRole("button", { name: "再試行", exact: true })).toBeVisible();
  await page.getByLabel("幅", { exact: true }).fill("210");
  await page.getByLabel("幅", { exact: true }).press("Tab");
  await expect(page.getByRole("button", { name: "再試行", exact: true })).toBeVisible();
  await page.unroute("**/*.wasm");
  await page.getByRole("button", { name: "再試行", exact: true }).click();
  await ready(page);
  await expect(page.getByLabel("幅", { exact: true })).toHaveValue("210");
});
