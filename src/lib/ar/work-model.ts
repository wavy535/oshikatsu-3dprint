import { AnalysisBudget, ModelLimitError } from "../print/limits.ts";
import type { NamedMesh } from "../print/mesh.ts";
import { StlParseError, parseStl } from "../print/stl.ts";
import { ThreeMfParseError, parseThreeMf } from "../print/threemf.ts";
import { ZipError } from "../print/zip.ts";
import { AR_LIMITS, AR_MATERIALS } from "./config.ts";
import { decimateToBudget, type TriangleMesh } from "./decimate.ts";
import { ArInputError } from "./errors.ts";
import type { ArMesh } from "./mesh.ts";

const MM_PER_M = 1000;
const UP: [number, number, number] = [0, 1, 0];

/** AR 用に変換できる3Dデータの拡張子 */
export const WORK_MODEL_EXTENSIONS = ["3mf", "stl"] as const;
export type WorkModelExtension = (typeof WORK_MODEL_EXTENSIONS)[number];

/** ファイル名の拡張子が AR 用に変換できる形式ならそれを、違えば null を返す（大文字小文字は区別しない） */
export function workModelExtension(fileName: string): WorkModelExtension | null {
  const dot = fileName.lastIndexOf(".");
  const extension = dot === -1 ? "" : fileName.slice(dot + 1).toLowerCase();
  return WORK_MODEL_EXTENSIONS.find((candidate) => candidate === extension) ?? null;
}

// 3Dデータの中身が原因で変換できないもの。サーバーの障害（S3・DB）とは分けて扱う
const MODEL_ERRORS = [ArInputError, ModelLimitError, StlParseError, ThreeMfParseError, ZipError];

/** 3Dデータの中身が原因で変換できなかったときのエラーか */
export const isUnconvertibleModelError = (error: unknown): error is Error =>
  MODEL_ERRORS.some((ErrorType) => error instanceof ErrorType);

/** 保存されている作品の3Dデータ（3MF / STL）を読み、パーツの一覧にする */
export function readModelObjects(buf: Buffer, fileName: string, budget: AnalysisBudget): NamedMesh[] {
  const extension = workModelExtension(fileName);
  if (extension === "3mf") return parseThreeMf(buf, budget).objects;
  if (extension === "stl") return parseStl(buf, fileName.replace(/\.[^.]+$/, "")).objects;
  throw new ArInputError("AR に対応していない形式の3Dデータです");
}

function mergeObjects(objects: NamedMesh[]): TriangleMesh {
  if (objects.length === 0) throw new ArInputError("3Dデータにパーツがありません");
  let positionLength = 0;
  let indexLength = 0;
  for (const { mesh } of objects) {
    positionLength += mesh.positions.length;
    indexLength += mesh.indices.length;
  }
  const positions = new Float64Array(positionLength);
  const indices = new Uint32Array(indexLength);
  let positionAt = 0;
  let indexAt = 0;
  for (const { mesh } of objects) {
    positions.set(mesh.positions, positionAt);
    const offset = positionAt / 3;
    for (let i = 0; i < mesh.indices.length; i++) indices[indexAt + i] = mesh.indices[i] + offset;
    positionAt += mesh.positions.length;
    indexAt += mesh.indices.length;
  }
  return { positions, indices };
}

/**
 * 作品の3Dデータ（mm、Z 軸が上）を AR 用のメッシュ（m、Y 軸が上）にする。
 * サイズ展開の倍率をかけ、底面を y=0、水平方向の中心を原点に置く。
 * 3MF の複数パーツは、印刷用に並べた位置のまま1つにまとめる。色は反映しない。
 */
export function buildWorkMeshes(objects: NamedMesh[], scaleRatio: number, budget = new AnalysisBudget()) {
  if (!Number.isFinite(scaleRatio) || scaleRatio <= 0)
    throw new ArInputError("サイズの倍率が不正です");

  const merged = mergeObjects(objects);
  const reduced = decimateToBudget(merged, AR_LIMITS.workTriangleBudget, budget);
  const triangleCount = reduced.indices.length / 3;
  if (triangleCount === 0) throw new ArInputError("AR 用の形状を作れませんでした");

  // 印刷データの (x, y, z) を glTF の (x, z, -y) に回す。回転なので面の向き（巻き順）は変わらない
  const scale = scaleRatio / MM_PER_M;
  const corners = new Float64Array(triangleCount * 9);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < reduced.indices.length; i++) {
    const source = reduced.indices[i] * 3;
    const target = i * 3;
    corners[target] = reduced.positions[source] * scale;
    corners[target + 1] = reduced.positions[source + 2] * scale;
    corners[target + 2] = -reduced.positions[source + 1] * scale;
    for (let k = 0; k < 3; k++) {
      if (corners[target + k] < min[k]) min[k] = corners[target + k];
      if (corners[target + k] > max[k]) max[k] = corners[target + k];
    }
  }

  const shift = [-(min[0] + max[0]) / 2, -min[1], -(min[2] + max[2]) / 2];
  const positions = new Float32Array(corners.length);
  for (let i = 0; i < corners.length; i++) positions[i] = corners[i] + shift[i % 3];

  // 面ごとに頂点を分けるので、法線は面の向きをそのまま使う（角がぼやけない）
  const normals = new Float32Array(corners.length);
  for (let t = 0; t < triangleCount; t++) {
    const a = t * 9;
    const u = [corners[a + 3] - corners[a], corners[a + 4] - corners[a + 1], corners[a + 5] - corners[a + 2]];
    const v = [corners[a + 6] - corners[a], corners[a + 7] - corners[a + 1], corners[a + 8] - corners[a + 2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const length = Math.hypot(n[0], n[1], n[2]);
    const normal = length > 0 ? [n[0] / length, n[1] / length, n[2] / length] : UP;
    for (let corner = 0; corner < 3; corner++) normals.set(normal, a + corner * 3);
  }

  const mesh: ArMesh = {
    name: "work",
    positions,
    normals,
    indices: null,
    material: { name: "work", color: AR_MATERIALS.work, roughness: AR_MATERIALS.roughness, doubleSided: true },
  };
  return { meshes: [mesh], sourceTriangles: merged.indices.length / 3, outputTriangles: triangleCount };
}
