import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
import { applyProposal } from "../../src/lib/design/ai-contract";
import { decoratedChair, curvedArmor } from "../fixtures/freeform-programs";

test.use({ viewport: { width: 390, height: 844 } });
test("image chat creates and edits a freeform chair through the real browser worker", async ({ page }, info) => {
  let calls = 0;
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/design/chat", async (route) => {
    const body = route.request().postDataJSON(); calls++;
    expect(body.images).toHaveLength(1);
    expect(body.images[0].dataUrl).toMatch(/^data:image\/jpeg;base64,/);
    const value = calls === 1 ? decoratedChair : { ...decoratedChair, source: decoratedChair.source.replaceAll("tube(path,1.5)", "tube(path,1.8)") };
    if (calls === 2) expect(body.design.programs[0].source).toBe(decoratedChair.source);
    const proposal = { message: "椅子を制作しました", changes: [{ path: "scene", value: "object" }, { path: "program.upsert", value }] };
    await route.fulfill({ json: { ...proposal, design: applyProposal(body.design, proposal).design, attempts: 1 } });
  });
  await page.goto("/create");
  await expect(page.getByTestId("design-status")).toHaveText("プレビューを更新しました");
  await page.getByLabel("参考画像", { exact: true }).setInputFiles("tests/fixtures/reference-white.jpg");
  await expect(page.getByRole("img", { name: "参考画像 1", exact: true })).toBeVisible();
  await page.getByLabel("変えたいところ", { exact: true }).fill("装飾の多い椅子を単体で作って");
  await page.getByRole("button", { name: "送信して編集" }).click();
  await expect(page.getByLabel("制作対象", { exact: true })).toHaveValue("object");
  await expect(page.getByLabel("部品一覧").getByRole("button")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "印刷用3MFを保存" })).toBeEnabled();
  await page.getByRole("button", { name: "視点を戻す" }).click();
  await page.screenshot({ path: info.outputPath("freeform-chair.png") });
  await page.getByLabel("変えたいところ", { exact: true }).fill("装飾を太くして");
  await page.getByRole("button", { name: "送信して編集" }).click();
  await expect(page.getByRole("log")).toContainText("更新");
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "印刷用3MFを保存" }).click();
  const files = unzipSync(await readFile((await (await downloading).path())!));
  const d = JSON.parse(strFromU8(files["design.oshinest.json"]));
  expect(d.programs[0].source).toContain("tube(path,1.8)");
  expect(Object.keys(files).filter((name) => name.endsWith(".3mf"))).toEqual(["model-1.3mf"]);
  await page.getByRole("button", { name: "取り消し", exact: true }).click();
  await page.getByRole("button", { name: "取り消し", exact: true }).click();
  await expect(page.getByLabel("制作対象", { exact: true })).toHaveValue("house");
  expect(errors).toEqual([]);
});

test("standalone armor sample loads, renders and exports", async ({ page }, info) => {
  await page.goto("/create");
  await page.getByText("設計を開く・ファイルに保存", { exact: true }).click();
  await page.getByLabel("設計ファイル", { exact: true }).setInputFiles("docs/examples/curved-armor.oshinest.json");
  await expect(page.getByLabel("部品一覧").getByRole("button", { name: curvedArmor.name })).toBeVisible();
  await expect(page.getByTestId("design-status")).toHaveText("プレビューを更新しました");
  await page.getByRole("button", { name: "視点を戻す" }).click();
  await page.screenshot({ path: info.outputPath("freeform-armor.png") });
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "GLBを保存" }).click();
  expect((await readFile((await (await downloading).path())!)).length).toBeGreaterThan(1000);
});
