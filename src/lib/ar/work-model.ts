import { BlendParseError, parseBlend } from "../print/blend.ts";
import { srgbHexToLinear } from "../print/color.ts";
import { AnalysisBudget, ModelLimitError } from "../print/limits.ts";
import { NO_MATERIAL, type MeshMaterial, type NamedMesh } from "../print/mesh.ts";
import { StlParseError, parseStl } from "../print/stl.ts";
import { ThreeMfParseError, parseThreeMf } from "../print/threemf.ts";
import { ZipError } from "../print/zip.ts";
import { AR_ANCHOR, AR_BLEND, AR_LIMITS, AR_MATERIALS, type ArAnchor } from "./config.ts";
import { decimateToBudget, type ColoredTriangleMesh, type TriangleMesh } from "./decimate.ts";
import { ArInputError } from "./errors.ts";
import type { ArMaterial, ArMesh } from "./mesh.ts";

const MM_PER_M = 1000;
const UP: [number, number, number] = [0, 1, 0];
// 色を持たないデータのメッシュ・マテリアルの名前
const WORK_MATERIAL_NAME = "work";
const OPAQUE = 1;

/** AR 用に変換できる3Dデータの拡張子 */
export const WORK_MODEL_EXTENSIONS = ["3mf", "stl", "blend"] as const;
export type WorkModelExtension = (typeof WORK_MODEL_EXTENSIONS)[number];

/** ファイル名の拡張子が AR 用に変換できる形式ならそれを、違えば null を返す（大文字小文字は区別しない） */
export function workModelExtension(fileName: string): WorkModelExtension | null {
  const dot = fileName.lastIndexOf(".");
  const extension = dot === -1 ? "" : fileName.slice(dot + 1).toLowerCase();
  return WORK_MODEL_EXTENSIONS.find((candidate) => candidate === extension) ?? null;
}

// 3Dデータの中身が原因で変換できないもの。サーバーの障害（S3・DB）とは分けて扱う
const MODEL_ERRORS = [ArInputError, ModelLimitError, StlParseError, ThreeMfParseError, ZipError, BlendParseError];

/** 3Dデータの中身が原因で変換できなかったときのエラーか */
export const isUnconvertibleModelError = (error: unknown): error is Error =>
  MODEL_ERRORS.some((ErrorType) => error instanceof ErrorType);

export type ModelReadOptions = {
  // .blend で表示から外すオブジェクトの名前
  excludeObjects?: readonly string[];
};

/** AR に出す3Dデータ。materials は三角形ごとの色番号（Mesh.materialIndices）が指す色 */
export type WorkModel = {
  objects: NamedMesh[];
  materials: readonly MeshMaterial[];
};

/** .blend を AR 用の設定（1 単位の長さ・分割回数の上限）で読み、オブジェクトと読み取りの報告を返す */
export function readBlendModel(buf: Buffer, budget: AnalysisBudget, options: ModelReadOptions = {}) {
  return parseBlend(
    buf,
    {
      mmPerUnit: AR_BLEND.mmPerUnit,
      maxSubdivisionLevels: AR_BLEND.maxSubdivisionLevels,
      excludeObjects: options.excludeObjects,
    },
    budget,
  );
}

/** 作品の3Dデータ（3MF / STL / .blend）を読み、パーツと色の一覧にする */
export function readModelObjects(
  buf: Buffer,
  fileName: string,
  budget: AnalysisBudget,
  options: ModelReadOptions = {},
): WorkModel {
  const extension = workModelExtension(fileName);
  if (extension === "3mf") {
    const document = parseThreeMf(buf, budget);
    return { objects: document.objects, materials: document.materials };
  }
  if (extension === "stl") {
    // STL は色を持たない
    return { objects: parseStl(buf, fileName.replace(/\.[^.]+$/, "")).objects, materials: [] };
  }
  if (extension === "blend") {
    const read = readBlendModel(buf, budget, options);
    return { objects: read.objects, materials: read.materials };
  }
  throw new ArInputError("AR に対応していない形式の3Dデータです");
}

// 全パーツを1つにまとめる。colors は三角形ごとの色番号で、色を持つパーツが1つもなければ null
function mergeObjects(objects: NamedMesh[]): ColoredTriangleMesh {
  if (objects.length === 0) throw new ArInputError("3Dデータにパーツがありません");
  let positionLength = 0;
  let indexLength = 0;
  for (const { mesh } of objects) {
    positionLength += mesh.positions.length;
    indexLength += mesh.indices.length;
  }
  const positions = new Float64Array(positionLength);
  const indices = new Uint32Array(indexLength);
  const colors = objects.some(({ mesh }) => mesh.materialIndices) ? new Int32Array(indexLength / 3) : null;
  let positionAt = 0;
  let indexAt = 0;
  for (const { mesh } of objects) {
    positions.set(mesh.positions, positionAt);
    const offset = positionAt / 3;
    for (let i = 0; i < mesh.indices.length; i++) indices[indexAt + i] = mesh.indices[i] + offset;
    if (colors) {
      const triangles = mesh.indices.length / 3;
      const at = indexAt / 3;
      for (let t = 0; t < triangles; t++) colors[at + t] = mesh.materialIndices?.[t] ?? NO_MATERIAL;
    }
    positionAt += mesh.positions.length;
    indexAt += mesh.indices.length;
  }
  return { positions, indices, colors };
}

/** 色ごとのまとまり。color は色の一覧の添字で、NO_MATERIAL は色の指定がないもの */
type ColorGroup = { color: number; mesh: TriangleMesh };

// 指定の三角形だけを、使っている頂点だけにまとめて取り出す
function takeTriangles(merged: TriangleMesh, triangles: readonly number[]): TriangleMesh {
  const indices = new Uint32Array(triangles.length * 3);
  const positions = new Float64Array(triangles.length * 9);
  const moved = new Map<number, number>();
  let vertexCount = 0;
  let at = 0;
  for (const t of triangles) {
    for (let k = 0; k < 3; k++) {
      const source = merged.indices[t * 3 + k];
      let target = moved.get(source);
      if (target === undefined) {
        target = vertexCount++;
        moved.set(source, target);
        for (let axis = 0; axis < 3; axis++) positions[target * 3 + axis] = merged.positions[source * 3 + axis];
      }
      indices[at++] = target;
    }
  }
  return { positions: positions.subarray(0, vertexCount * 3), indices };
}

/**
 * 三角形を色ごとに分ける。色がない（または色の一覧が空の）ときは1つのまとまりにする。
 * 色が多すぎるときは、面数の多い色だけ残して残りを「色の指定なし」にまとめる。
 */
function splitByColor(merged: ColoredTriangleMesh, materials: readonly MeshMaterial[]): ColorGroup[] {
  if (!merged.colors || materials.length === 0) return [{ color: NO_MATERIAL, mesh: merged }];
  const byColor = new Map<number, number[]>();
  for (let t = 0; t < merged.colors.length; t++) {
    const value = merged.colors[t];
    const color = value >= 0 && value < materials.length ? value : NO_MATERIAL;
    const list = byColor.get(color);
    if (list) list.push(t);
    else byColor.set(color, [t]);
  }
  if (byColor.size > AR_LIMITS.maxColorGroups) {
    const ranked = [...byColor].sort((a, b) => b[1].length - a[1].length);
    const kept = new Map(ranked.slice(0, AR_LIMITS.maxColorGroups - 1));
    const rest = ranked.slice(AR_LIMITS.maxColorGroups - 1).flatMap(([, triangles]) => triangles);
    kept.set(NO_MATERIAL, [...(kept.get(NO_MATERIAL) ?? []), ...rest]);
    byColor.clear();
    for (const [color, triangles] of kept) byColor.set(color, triangles);
  }
  return [...byColor]
    .sort((a, b) => a[0] - b[0])
    .map(([color, triangles]) => ({ color, mesh: takeTriangles(merged, triangles) }));
}

/** 色の一覧の添字から AR のマテリアルを作る。色がなければ作品用の単色 */
function materialOf(color: number, materials: readonly MeshMaterial[]): ArMaterial {
  const found = color >= 0 ? materials[color] : undefined;
  const linear = found ? srgbHexToLinear(found.hex) : null;
  return {
    name: found?.name ?? WORK_MATERIAL_NAME,
    color: linear ? [linear[0], linear[1], linear[2], OPAQUE] : AR_MATERIALS.work,
    roughness: AR_MATERIALS.roughness,
    doubleSided: true,
  };
}

// 印刷データの (x, y, z) を glTF の (x, z, -y) に回し、三角形ごとに頂点を分けて並べる。
// 回転なので面の向き（巻き順）は変わらない
function orient(mesh: TriangleMesh, scale: number, min: number[], max: number[]) {
  const corners = new Float64Array(mesh.indices.length * 3);
  for (let i = 0; i < mesh.indices.length; i++) {
    const source = mesh.indices[i] * 3;
    const target = i * 3;
    corners[target] = mesh.positions[source] * scale;
    corners[target + 1] = mesh.positions[source + 2] * scale;
    corners[target + 2] = -mesh.positions[source + 1] * scale;
    for (let k = 0; k < 3; k++) {
      if (corners[target + k] < min[k]) min[k] = corners[target + k];
      if (corners[target + k] > max[k]) max[k] = corners[target + k];
    }
  }
  return corners;
}

// 面ごとに頂点を分けているので、法線は面の向きをそのまま使う（角がぼやけない）
function flatNormals(corners: Float64Array) {
  const normals = new Float32Array(corners.length);
  for (let t = 0; t < corners.length / 9; t++) {
    const a = t * 9;
    const u = [corners[a + 3] - corners[a], corners[a + 4] - corners[a + 1], corners[a + 5] - corners[a + 2]];
    const v = [corners[a + 6] - corners[a], corners[a + 7] - corners[a + 1], corners[a + 8] - corners[a + 2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const length = Math.hypot(n[0], n[1], n[2]);
    const normal = length > 0 ? [n[0] / length, n[1] / length, n[2] / length] : UP;
    for (let corner = 0; corner < 3; corner++) normals.set(normal, a + corner * 3);
  }
  return normals;
}

/**
 * 作品の3Dデータ（mm、Z 軸が上）を AR 用のメッシュ（m、Y 軸が上）にする。
 * サイズ展開の倍率をかけ、底面を y=0 に置く。水平方向の原点は基準点の指定で決める。
 * 複数パーツは、読み込んだときの位置のまま1つにまとめる。
 * 色を持つデータ（3MF の basematerials・.blend のマテリアル）は、色ごとのメッシュに分けて色を付ける。
 */
export function buildWorkMeshes(
  model: WorkModel,
  scaleRatio: number,
  budget = new AnalysisBudget(),
  anchor: ArAnchor = AR_ANCHOR.work,
) {
  if (!Number.isFinite(scaleRatio) || scaleRatio <= 0)
    throw new ArInputError("サイズの倍率が不正です");

  const merged = mergeObjects(model.objects);
  const sourceTriangles = merged.indices.length / 3;
  // 間引きは色で分ける前に全体へ1回かける（色ごとにかけると外形が丸まってしまう）
  const reduced = decimateToBudget(merged, AR_LIMITS.workTriangleBudget, budget);
  const scale = scaleRatio / MM_PER_M;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  // 色ごとに分けて向きをそろえる。原点は全体の外形から決めるので後回し
  const oriented = splitByColor(reduced, model.materials).flatMap(({ color, mesh }) =>
    mesh.indices.length === 0 ? [] : [{ color, corners: orient(mesh, scale, min, max) }],
  );
  const outputTriangles = oriented.reduce((sum, group) => sum + group.corners.length / 9, 0);
  if (outputTriangles === 0) throw new ArInputError("AR 用の形状を作れませんでした");

  // 底面はどちらの基準点でも y=0。角を基準にするときは、奥（-Z）の左（-X）の端を原点に持ってくる。
  // 色ごとに分けても位置がずれないよう、同じずらし量を全部に使う
  const shift =
    anchor === "back-left-bottom"
      ? [-min[0], -min[1], -min[2]]
      : [-(min[0] + max[0]) / 2, -min[1], -(min[2] + max[2]) / 2];

  const meshes: ArMesh[] = oriented.map(({ color, corners }, index) => {
    const positions = new Float32Array(corners.length);
    for (let i = 0; i < corners.length; i++) positions[i] = corners[i] + shift[i % 3];
    return {
      name: oriented.length === 1 ? WORK_MATERIAL_NAME : `${WORK_MATERIAL_NAME}-${index + 1}`,
      positions,
      normals: flatNormals(corners),
      indices: null,
      material: materialOf(color, model.materials),
    };
  });
  return { meshes, sourceTriangles, outputTriangles };
}
