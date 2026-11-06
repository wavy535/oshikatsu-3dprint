import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  Vector3,
} from "three";
import { analyzeTopology, weldVertices } from "../../src/lib/print/analyze";
import { boundsOf } from "../../src/lib/print/mesh";
import { parseThreeMf } from "../../src/lib/print/threemf";
import type { ModelProgram } from "../../src/lib/design/program";
import { previewReady, showChat, showPrintExport } from "./helpers/design";

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

async function downloadPrint(page: Page) {
  await showPrintExport(page);
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "印刷用3MFを保存" }).click();
  return unzipSync(await readFile((await (await downloading).path())!));
}

// Compare the actual model XML, independent of ZIP timestamps.
function printModels(files: Record<string, Uint8Array>) {
  return Object.fromEntries(
    Object.entries(files)
      .filter(([name]) => name.endsWith(".3mf"))
      .map(([name, bytes]) => [
        name,
        strFromU8(unzipSync(bytes)["3D/3dmodel.model"]),
      ]),
  );
}

test("curved cutout survives worker export, undo and redo", async ({
  page,
}) => {
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
        design: { ...design, scene: "object", programs: [leaf] },
        attempts: 1,
      },
    });
  });
  await page.goto("/create");
  await previewReady(page);
  const original = await downloadPrint(page);
  const originalDesign = JSON.parse(
    strFromU8(original["design.oshinest.json"]),
  );
  await showChat(page);
  await page
    .getByLabel("変えたいところ", { exact: true })
    .fill("葉の輪郭と抜け穴を作って");
  await page.getByRole("button", { name: "送信して編集" }).click();
  await expect(page.getByRole("log")).toContainText("変更を反映しました");
  await previewReady(page);
  await expect(
    page.getByRole("img", { name: /制作物の3Dプレビュー/ }),
  ).toBeInViewport({ ratio: 1 });
  const files = await downloadPrint(page);
  expect(JSON.parse(strFromU8(files["design.oshinest.json"]))).toEqual({
    ...originalDesign,
    scene: "object",
    programs: [leaf],
  });
  expect(Object.keys(files).filter((name) => name.endsWith(".3mf"))).toEqual([
    "model-1.3mf",
  ]);
  const printed = parseThreeMf(Buffer.from(files["model-1.3mf"]));
  expect(printed.unit).toBe("mm");
  expect(printed.objects).toHaveLength(1);
  const mesh = printed.objects[0].mesh;
  const bounds = boundsOf(mesh);
  expect(bounds.min).toEqual([0, 0, 0]);
  expect(bounds.max[0]).toBeCloseTo(33.2, 4);
  expect(bounds.max.slice(1)).toEqual([80, 4]);
  expect(analyzeTopology(weldVertices(mesh))).toMatchObject({
    isManifold: true,
    duplicateTriangleCount: 0,
  });

  // A vertical ray passes through the cutout, but crosses both surfaces of
  // the curved blade. Merely exporting the source JSON cannot satisfy this.
  const geometry = new BufferGeometry();
  const material = new MeshBasicMaterial({ side: DoubleSide });
  try {
    geometry.setAttribute(
      "position",
      new Float32BufferAttribute(mesh.positions, 3),
    );
    geometry.setIndex(Array.from(mesh.indices));
    const model = new Mesh(geometry, material);
    const hits = (x: number, y: number) =>
      new Raycaster(new Vector3(x, y, 10), new Vector3(0, 0, -1))
        .intersectObject(model)
        .map((hit) => hit.point.z);
    expect(hits(14, 50)).toEqual([]);
    expect(hits(5, 25)).toEqual([4, 0]);
  } finally {
    geometry.dispose();
    material.dispose();
  }

  await page.getByRole("button", { name: "取り消し", exact: true }).click();
  const undone = await downloadPrint(page);
  expect(JSON.parse(strFromU8(undone["design.oshinest.json"]))).toEqual(
    originalDesign,
  );
  expect(printModels(undone)).toEqual(printModels(original));
  await page.getByRole("button", { name: "やり直し", exact: true }).click();
  const redone = await downloadPrint(page);
  expect(printModels(redone)).toEqual(printModels(files));
  expect(errors).toEqual([]);
});

test("an open contour cannot replace the current model or enter undo history", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/design/chat", async (route) => {
    const body = route.request().postDataJSON();
    calls++;
    if (calls === 2) {
      expect(body.geometryFeedback.error).toContain("曲線1の終点");
      expect(body.design.programs).toEqual([]);
    }
    const invalid = {
      ...leaf,
      source: `return bezierExtrude([
      [[0,0],[0,20],[20,20],[20,0]],
      [[19,0],[20,-4],[0,-4],[0,0]]
    ],4);`,
    };
    await route.fulfill({
      json: {
        message: "輪郭を作りました。",
        changes: [
          { path: "scene", value: "object" },
          { path: "program.upsert", value: invalid },
        ],
        design: { ...body.design, scene: "object", programs: [invalid] },
        attempts: 1,
      },
    });
  });
  await page.goto("/create");
  await previewReady(page);
  const original = await downloadPrint(page);
  await showChat(page);
  await page.getByLabel("変えたいところ", { exact: true }).fill("葉を作って");
  await page.getByRole("button", { name: "送信して編集" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "現在のモデルは変更していません",
  );
  expect(calls).toBe(2);
  await expect(
    page.getByRole("button", { name: "取り消し", exact: true }),
  ).toBeDisabled();
  const unchanged = await downloadPrint(page);
  expect(JSON.parse(strFromU8(unchanged["design.oshinest.json"]))).toEqual(
    JSON.parse(strFromU8(original["design.oshinest.json"])),
  );
  expect(printModels(unchanged)).toEqual(printModels(original));
});
