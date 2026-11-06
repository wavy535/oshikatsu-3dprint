import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
import { applyProposal } from "../../src/lib/design/ai-contract";
import {
  expectPreviewInViewport,
  previewReady,
  showManual,
  showPrintExport,
} from "./helpers/design";

test.use({ viewport: { width: 390, height: 844 } });

test("live mobile editing, undo, local restore, print and AR share one design", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/create");
  await previewReady(page);
  await expectPreviewInViewport(page);
  await expect(
    page.getByLabel("変えたいところ", { exact: true }),
  ).toBeInViewport({ ratio: 1 });
  await showManual(page);
  const width = page.getByLabel("幅", { exact: true });
  await width.fill("210");
  await previewReady(page);
  await expect(width).toBeFocused();
  await expect(page.getByLabel("プレビューと出力")).toContainText(
    "210 × 160 × 175",
  );
  await expectPreviewInViewport(page);
  await page.getByRole("button", { name: "取り消し", exact: true }).click();
  await expect(width).toHaveValue("190");
  await page.getByRole("button", { name: "やり直し", exact: true }).click();
  await expect(width).toHaveValue("210");
  await page.getByLabel("棚を置く").check();
  await previewReady(page);
  await page.getByRole("button", { name: "完成・ARへ", exact: true }).click();
  await page
    .getByRole("button", { name: "この端末に作品を保存", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "この端末に保存しました" }),
  ).toBeVisible();
  await page.reload();
  await previewReady(page);
  await showManual(page);
  await page.getByText("設計を開く・ファイルに保存", { exact: true }).click();
  await page.getByRole("button", { name: "保存した設計を開く" }).click();
  await expect(width).toHaveValue("210");
  await expect(page.getByLabel("棚を置く")).toBeChecked();
  await previewReady(page);
  await showPrintExport(page);
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "印刷用3MFを保存" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("oshinest-parts.zip");
  const files = unzipSync(await readFile((await download.path())!));
  expect(
    Object.keys(files).filter((name) => name.endsWith(".3mf")),
  ).toHaveLength(7);
  expect(JSON.parse(strFromU8(files["design.oshinest.json"])).house.width).toBe(
    210,
  );
  await page.getByRole("button", { name: "ARで確認", exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator("model-viewer")
        .evaluate(
          (element) => (element as HTMLElement & { loaded: boolean }).loaded,
        ),
    )
    .toBe(true);
  await expect
    .poll(() =>
      page
        .locator("model-viewer")
        .evaluate((element) => (element as HTMLElement & { src: string }).src),
    )
    .toMatch(/^blob:/);
  await expect(page.locator("model-viewer")).toHaveAttribute(
    "ios-src",
    /^blob:/,
  );
  await page.screenshot({ path: info.outputPath("editor-mobile-ar.png") });
  await showManual(page);
  await width.fill("220");
  await previewReady(page);
  await page.getByRole("button", { name: "完成・AR", exact: true }).click();
  await expect(page.locator("model-viewer")).toHaveCount(0);
  await expectPreviewInViewport(page);
  expect(errors).toEqual([]);
});

test("invalid files and fields preserve the design; manufacturing errors only block print", async ({
  page,
}) => {
  await page.goto("/create");
  await previewReady(page);
  await showManual(page);
  await page.getByText("設計を開く・ファイルに保存", { exact: true }).click();
  await page
    .getByLabel("設計ファイル", { exact: true })
    .setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"version":99}'),
    });
  await expect(page.getByRole("alert")).toContainText("対応範囲外");
  await expect(page.getByLabel("幅", { exact: true })).toHaveValue("190");
  await page.getByLabel("窓の幅", { exact: true }).fill("190");
  await page.getByLabel("窓の幅", { exact: true }).press("Tab");
  await expect(page.getByRole("alert")).toContainText("窓の周囲");
  await expect(page.getByLabel("窓の幅", { exact: true })).toHaveValue("55");
  await page.getByLabel("板厚", { exact: true }).fill("1");
  await previewReady(page);
  await showPrintExport(page);
  await expect(page.getByText(/要修正：板厚/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "印刷用3MFを保存" }),
  ).toBeDisabled();
  await expect(page.getByRole("button", { name: "GLBを保存" })).toBeEnabled();
});

test("320px offline editing retains the preview and supports partial numeric input", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/create");
  await previewReady(page);
  await showManual(page);
  await context.setOffline(true);
  try {
    const width = page.getByLabel("幅", { exact: true });
    await width.fill("");
    await expect(width).toHaveValue("");
    await expect(page.getByLabel("プレビューと出力")).toContainText(
      "190 × 160 × 175",
    );
    await width.fill("21");
    await width.press("Tab");
    await expect(width).toHaveValue("190");
    await width.fill("210");
    await previewReady(page);
    await expect(width).toBeFocused();
    await page.getByLabel("屋根の立ち上がり").fill("0");
    await previewReady(page);
    await expect(
      page.getByLabel("部品一覧").getByRole("button", { name: "平らな屋根" }),
    ).toBeVisible();
    await expectPreviewInViewport(page);
    await page.getByText("設計を開く・ファイルに保存", { exact: true }).click();
    const downloading = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "設計ファイルを保存", exact: true })
      .click();
    expect((await downloading).suggestedFilename()).toBe("house.oshinest.json");
  } finally {
    await context.setOffline(false);
  }
});

test("desktop input updates before blur with a visible preview under 4x CPU slowdown", async ({
  page,
  context,
}, info) => {
  await page.setViewportSize({ width: 1365, height: 900 });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.goto("/create");
  await previewReady(page);
  await showManual(page);
  const times: number[] = [];
  for (let index = 1; index <= 10; index++) {
    const value = 190 + index * 2;
    const start = await page.evaluate(() => performance.now());
    await page.getByLabel("幅", { exact: true }).fill(String(value));
    await previewReady(page);
    await expect(page.getByLabel("幅", { exact: true })).toBeFocused();
    await expect(page.getByLabel("プレビューと出力")).toContainText(
      `${value} × 160 × 175`,
    );
    times.push((await page.evaluate(() => performance.now())) - start);
  }
  await info.attach("editing-latency.json", {
    body: JSON.stringify({
      cpuSlowdown: 4,
      trigger: "input-before-blur",
      times,
    }),
    contentType: "application/json",
  });
  await expectPreviewInViewport(page);
  await page.screenshot({ path: info.outputPath("editor-desktop.png") });
});

test("browsing works does not load modelling code; the home goes straight to creation", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto("/works");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(requests.some((url) => /manifold|geometry\.worker/.test(url))).toBe(
    false,
  );
  await page.goto("/");
  await expect(page).toHaveURL(/\/create$/);
  await previewReady(page);
  expect(requests.some((url) => url.includes(".wasm"))).toBe(true);
});

test("failed WASM load can be retried without discarding edits", async ({
  page,
}) => {
  await page.route("**/*.wasm", (route) => route.abort());
  await page.goto("/create");
  await expect(
    page.getByRole("button", { name: "再試行", exact: true }),
  ).toBeVisible();
  await showManual(page);
  await page.getByLabel("幅", { exact: true }).fill("210");
  await expect(
    page.getByRole("button", { name: "再試行", exact: true }),
  ).toBeVisible();
  await page.unroute("**/*.wasm");
  await page.getByRole("button", { name: "再試行", exact: true }).click();
  await previewReady(page);
  await expect(page.getByLabel("幅", { exact: true })).toHaveValue("210");
});

test("AI and manual gable edits use the same history and exported geometry", async ({
  page,
}) => {
  await page.route("**/api/design/chat", async (route) => {
    const { design } = route.request().postDataJSON();
    const proposal = {
      message: "前後の隙間を埋めました。",
      changes: [{ path: "house.gables", value: true }],
    };
    await route.fulfill({
      json: {
        ...proposal,
        design: applyProposal(design, proposal).design,
        attempts: 1,
      },
    });
  });
  await page.goto("/create");
  await previewReady(page);
  await page
    .getByRole("button", { name: "屋根の隙間を埋める", exact: true })
    .click();
  await page.getByRole("button", { name: "送信して編集" }).click();
  await expect(page.getByRole("log")).toContainText("変更を反映しました");
  await showManual(page);
  await expect(page.getByLabel("壁と屋根の隙間を埋める")).toBeChecked();
  await expect(
    page
      .getByLabel("部品一覧")
      .getByRole("button", { name: "屋根下の壁・手前" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "取り消し", exact: true }).click();
  await expect(page.getByLabel("壁と屋根の隙間を埋める")).not.toBeChecked();
  await page.getByLabel("壁と屋根の隙間を埋める").check();
  await previewReady(page);
  await showPrintExport(page);
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "印刷用3MFを保存" }).click();
  const files = unzipSync(await readFile((await (await downloading).path())!));
  expect(files["gable-front.3mf"]).toBeDefined();
  expect(files["gable-back.3mf"]).toBeDefined();
  expect(
    JSON.parse(strFromU8(files["design.oshinest.json"])).house.gables,
  ).toBe(true);
});
