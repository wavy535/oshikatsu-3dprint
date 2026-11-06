import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import { applyProposal } from "../../src/lib/design/ai-contract";
import { readDesign } from "../../src/lib/design/document";
import type { ModelProgram } from "../../src/lib/design/program";
import { previewReady, showManual, showPrintExport } from "./helpers/design";

// Recorded model output for exercising curved outlines and a cutout in the worker.
const leaf: ModelProgram = {
  id: "model-1",
  name: "カーブした葉の透かし飾り",
  x: 100,
  y: 80,
  color: "#999999",
  size: [33.2, 80, 4],
  source: `const outline = [
  [[0,0],[0,27],[6,57],[31.6,80]],
  [[31.6,80],[32.6,77],[33.2,74],[33.2,71]],
  [[33.2,71],[33.2,60],[25,49],[18,39]],
  [[18,39],[11,29],[2,13],[0,0]]
];
const opening = [
  [[7,32],[6.5,37],[13,57],[20.2,63.8]],
  [[20.2,63.8],[22.5,65],[11,34],[7,32]]
];
const base = bezierExtrude(outline,4);
const cutout = move(bezierExtrude(opening,6),[0,0,-1]);
return subtract(base,cutout);`,
};

test.use({ viewport: { width: 390, height: 844 } });

test("recorded AI curved contour renders, prints and undoes through the browser worker", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/design/chat", async (route) => {
    const { design } = route.request().postDataJSON();
    const proposal = {
      message: "葉の輪郭と抜け穴を作りました。",
      changes: [
        { path: "scene", value: "object" },
        { path: "program.upsert", value: leaf },
      ],
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
    .getByLabel("変えたいところ", { exact: true })
    .fill("葉の輪郭と抜け穴を作って");
  await page.getByRole("button", { name: "送信して編集" }).click();
  await expect(page.getByRole("log")).toContainText("変更を反映しました");
  await previewReady(page);
  await expect(
    page.getByRole("img", { name: /制作物の3Dプレビュー/ }),
  ).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: info.outputPath("curved-leaf.png") });
  await showPrintExport(page);
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "印刷用3MFを保存" }).click();
  const files = unzipSync(await readFile((await (await downloading).path())!));
  const exported = readDesign(strFromU8(files["design.oshinest.json"]));
  expect(exported.programs).toEqual([leaf]);
  expect(Object.keys(files).filter((name) => name.endsWith(".3mf"))).toEqual([
    "model-1.3mf",
  ]);
  await page.getByRole("button", { name: "取り消し", exact: true }).click();
  await showManual(page);
  await expect(page.getByLabel("制作対象", { exact: true })).toHaveValue(
    "house",
  );
  await page.getByRole("button", { name: "やり直し", exact: true }).click();
  await expect(page.getByLabel("制作対象", { exact: true })).toHaveValue(
    "object",
  );
  expect(errors).toEqual([]);
});
