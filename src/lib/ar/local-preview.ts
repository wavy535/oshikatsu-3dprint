import "server-only";
import { AR_ANCHOR, AR_DEV_PAGE } from "./config";
import { readLocalModel } from "./local-models";
import { meshSizeMm } from "./mesh";
import { buildWorkMeshes, readBlendModel, readModelObjects, workModelExtension } from "./work-model";
import { AnalysisBudget } from "../print/limits";

/** 開発ページの寸法表示と配信用APIで、解析・縮尺・基準点を揃える。 */
export function convertLocalModel(buffer: Buffer, name: string, excludeObjects: readonly string[]) {
  const budget = new AnalysisBudget();
  const blend = workModelExtension(name) === "blend"
    ? readBlendModel(buffer, budget, { excludeObjects })
    : null;
  const model = blend
    ? { objects: blend.objects, materials: blend.materials }
    : readModelObjects(buffer, name, budget);
  const result = buildWorkMeshes(model, AR_DEV_PAGE.localModelScale, budget, AR_ANCHOR.room);
  return { ...result, sizeMm: meshSizeMm(result.meshes), blend: blend?.report ?? null, colors: model.materials.map(({ name, hex }) => ({ name, hex })) };
}

type LocalModelPreview =
  | ({ ok: true } & Omit<ReturnType<typeof convertLocalModel>, "meshes">)
  | { ok: false; message: string };

/** 開発用の診断では変換失敗の理由を表示する。ファイル読み込みの障害は呼び出し元へ伝える。 */
export async function previewLocalModel(name: string, excludeObjects: readonly string[]): Promise<LocalModelPreview> {
  const buffer = await readLocalModel(name);
  if (!buffer) return { ok: false, message: "ファイルを読めませんでした" };
  try {
    const { sizeMm, sourceTriangles, outputTriangles, blend, colors } = convertLocalModel(buffer, name, excludeObjects);
    return { ok: true, sizeMm, sourceTriangles, outputTriangles, blend, colors };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}
