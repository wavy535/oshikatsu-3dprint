import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { unzipSync } from "fflate";
import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  Vector3,
} from "three";
import { parseThreeMf } from "../../src/lib/print/threemf";
import { boundsOf } from "../../src/lib/print/mesh";
import { analyzeTopology, weldVertices } from "../../src/lib/print/analyze";
import type { ModelProgram } from "../../src/lib/design/program";
import { previewReady, showPrintExport } from "./helpers/design";

test("radial loft and resize reach the browser worker and export an open cup with its floor", async ({
  page,
}) => {
  const program: ModelProgram = {
    id: "model-1",
    name: "楕円のペン立て",
    color: "#999999",
    x: 100,
    y: 80,
    size: [40, 30, 40],
    source: `const outside=radialLoft([[0,0,0,80,60,0,0],[0,0,80,80,60,0,0]],0);
const inside=radialLoft([[0,0,6,68,48,0,0],[0,0,82,68,48,0,0]],0);
return resize(subtract(outside,inside),[40,30,40]);`,
  };
  await page.route("**/api/design/chat", async (route) => {
    const { design } = route.request().postDataJSON();
    await route.fulfill({
      json: {
        message: "楕円のペン立てを作りました。",
        changes: [
          { path: "scene", value: "object" },
          { path: "program.upsert", value: program },
        ],
        design: { ...design, scene: "object", programs: [program] },
        attempts: 1,
      },
    });
  });
  await page.goto("/create");
  await previewReady(page);
  await page
    .getByLabel("変えたいところ", { exact: true })
    .fill("底厚3mmで高さ40mmの楕円のペン立てを作って");
  await page.getByRole("button", { name: "送信して編集" }).click();
  await expect(page.getByRole("log")).toContainText("変更を反映しました");
  await showPrintExport(page);
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "印刷用3MFを保存" }).click();
  const files = unzipSync(await readFile((await (await downloading).path())!));
  const printed = parseThreeMf(Buffer.from(files["model-1.3mf"]));
  expect(printed.objects).toHaveLength(1);
  const mesh = printed.objects[0].mesh;
  expect(boundsOf(mesh)).toEqual({ min: [0, 0, 0], max: [40, 30, 40] });
  expect(analyzeTopology(weldVertices(mesh))).toMatchObject({
    isManifold: true,
    duplicateTriangleCount: 0,
  });
  const geometry = new BufferGeometry();
  const material = new MeshBasicMaterial({ side: DoubleSide });
  try {
    geometry.setAttribute(
      "position",
      new Float32BufferAttribute(mesh.positions, 3),
    );
    geometry.setIndex(Array.from(mesh.indices));
    const model = new Mesh(geometry, material);
    const hits = (x: number) =>
      new Raycaster(new Vector3(x, 15.19, 60), new Vector3(0, 0, -1))
        .intersectObject(model)
        .map((hit) => hit.point.z);
    expect(hits(20.37)).toEqual([3, 0]);
    expect(hits(38.5)).toEqual([40, 0]);
  } finally {
    geometry.dispose();
    material.dispose();
  }
});
