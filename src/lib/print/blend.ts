import { BlendFile, BlendParseError, NULL_ADDRESS, decompressBlend, type BlendBlock } from "./blend-file.ts";
import { AnalysisBudget, MODEL_LIMITS, checkMeshSize, checkModelFileSize } from "./limits.ts";
import type { NamedMesh } from "./mesh.ts";
import { triangulatePolygon } from "./polygon.ts";
import { catmullClark, type PolyMesh } from "./subdivision.ts";

export { BlendParseError } from "./blend-file.ts";

// Blender の .blend から、レンダリングに出るメッシュのオブジェクトを取り出す。
// 形状はファイルに保存されたメッシュで、モディファイアは Subdivision Surface だけを再現する。
// 座標は Blender のワールド座標（Z が上）に、1 単位の長さ（mm）を掛けて返す。

// Blender の定義値（source/blender/makesdna の DNA_*_types.h）
const OB_MESH = 1;
const OB_HIDE_RENDER = 1 << 2;
const BASE_ENABLED_RENDER = 1 << 7;
const PARENT_TYPE_MASK = (1 << 4) - 1;
const PAROBJECT = 0;
const MODIFIER_MODE_RENDER = 1 << 1;
const SUBSURF_TYPE_SIMPLE = 1;
const SUBSURF_FLAG_RECURSIVE = 1 << 6;
const SUBSURF_BOUNDARY_PRESERVE_CORNERS = 1;
const ROT_MODE_QUAT = 0;
const ROT_MODE_AXIS_ANGLE = -1;
const ATTRIBUTE_STORAGE_ARRAY = 0;
// 回転モード（1〜6）ごとの、先に回す軸からの順（0 = X, 1 = Y, 2 = Z）
const EULER_ORDERS: Record<number, readonly [number, number, number]> = {
  1: [0, 1, 2],
  2: [0, 2, 1],
  3: [1, 0, 2],
  4: [1, 2, 0],
  5: [2, 0, 1],
  6: [2, 1, 0],
};
// 形を変えないので読み飛ばすモディファイア（DNA の構造体名）
const SHAPE_NEUTRAL_MODIFIERS = new Set(["CollisionModifierData"]);
const SUBSURF_MODIFIER = "SubsurfModifierData";
const MODIFIER_SUFFIX = /ModifierData$/;
const POSITION_ATTRIBUTE = "position";
const CORNER_VERT_ATTRIBUTE = ".corner_vert";
const MIN_FACE_CORNERS = 3;
const MATRIX_4X4_FLOATS = 16;
const MATRIX_4X4_COLUMNS = 4;
const QUATERNION_FLOATS = 4;

export type BlendReadOptions = {
  // 1 Blender 単位の長さ（mm）
  mmPerUnit: number;
  // Subdivision Surface の分割回数の上限。ファイルの指定がこれより多ければここで止める
  maxSubdivisionLevels: number;
  // 表示から外すオブジェクトの名前
  excludeObjects?: readonly string[];
};

export type BlendReport = {
  // レンダリングに出るメッシュのオブジェクト（名前順）。excluded は excludeObjects で外したもの
  objects: { name: string; excluded: boolean }[];
  // レンダリングで非表示のメッシュのオブジェクトの数
  hiddenObjects: number;
  // 形を変えるが再現しなかったモディファイア（Bevel など）と、分割回数を抑えた Subdivision Surface
  modifierNotes: { object: string; modifier: string; note: "unsupported" | "levels_limited" }[];
};

type Affine = { m: number[]; t: number[] };

const identity = (): Affine => ({ m: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] });

function multiply3(a: number[], b: number[]) {
  const out = new Array<number>(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) out[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  }
  return out;
}

const apply3 = (m: number[], v: number[]) => [0, 1, 2].map((r) => m[r * 3] * v[0] + m[r * 3 + 1] * v[1] + m[r * 3 + 2] * v[2]);

// a のあとに b ではなく、「b を先にかけてから a」の合成（a · b）
const compose = (a: Affine, b: Affine): Affine => ({
  m: multiply3(a.m, b.m),
  t: apply3(a.m, b.t).map((value, k) => value + a.t[k]),
});

const determinant3 = (m: number[]) =>
  m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);

function axisRotation(axis: number, angle: number) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  if (axis === 0) return [1, 0, 0, 0, c, -s, 0, s, c];
  if (axis === 1) return [c, 0, s, 0, 1, 0, -s, 0, c];
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}

function eulerRotation(angles: number[], rotmode: number) {
  const order = EULER_ORDERS[rotmode];
  if (!order) throw new BlendParseError(`.blend のオブジェクトの回転モード（${rotmode}）に対応していません`);
  // 先に回す軸の行列が右に来る
  return order.reduce((matrix, axis) => multiply3(axisRotation(axis, angles[axis]), matrix), identity().m);
}

function quaternionRotation(q: number[]) {
  const length = Math.hypot(q[0], q[1], q[2], q[3]);
  if (length === 0) return identity().m;
  const [w, x, y, z] = q.map((value) => value / length);
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
    2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
    2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y),
  ];
}

function axisAngleRotation(axis: number[], angle: number) {
  const length = Math.hypot(axis[0], axis[1], axis[2]);
  if (length === 0) return identity().m;
  const half = angle / 2;
  const s = Math.sin(half) / length;
  return quaternionRotation([Math.cos(half), axis[0] * s, axis[1] * s, axis[2] * s]);
}

// Blender の BKE_object_to_mat4 と同じ：(位置 + 差分) · (差分の回転 · 回転) · (拡縮 × 差分の拡縮)
function localTransform(file: BlendFile, ob: BlendBlock): Affine {
  const f3 = (path: string) => file.floats(ob, "Object", path, 3);
  const rotmode = file.int16(ob, "Object", "rotmode");
  let rotation: number[];
  if (rotmode === ROT_MODE_QUAT) {
    rotation = multiply3(
      quaternionRotation(file.floats(ob, "Object", "dquat", QUATERNION_FLOATS)),
      quaternionRotation(file.floats(ob, "Object", "quat", QUATERNION_FLOATS)),
    );
  } else if (rotmode === ROT_MODE_AXIS_ANGLE) {
    rotation = multiply3(
      axisAngleRotation(f3("drotAxis"), file.floats(ob, "Object", "drotAngle", 1)[0]),
      axisAngleRotation(f3("rotAxis"), file.floats(ob, "Object", "rotAngle", 1)[0]),
    );
  } else {
    rotation = multiply3(eulerRotation(f3("drot"), rotmode), eulerRotation(f3("rot"), rotmode));
  }
  const size = f3("size");
  const deltaScale = f3("dscale");
  const scale = [0, 1, 2].map((k) => size[k] * deltaScale[k]);
  const scaleMatrix = [scale[0], 0, 0, 0, scale[1], 0, 0, 0, scale[2]];
  const loc = f3("loc");
  const deltaLoc = f3("dloc");
  return { m: multiply3(rotation, scaleMatrix), t: loc.map((value, k) => value + deltaLoc[k]) };
}

function worldTransform(file: BlendFile, ob: BlendBlock, depth = 0): Affine {
  if (depth > MODEL_LIMITS.componentDepth) throw new BlendParseError(".blend のオブジェクトの親子関係が深すぎるか循環しています");
  const local = localTransform(file, ob);
  const parent = file.resolve(ob, file.pointer(ob, "Object", "parent"));
  if (!parent) return local;
  if ((file.int16(ob, "Object", "partype") & PARENT_TYPE_MASK) !== PAROBJECT)
    throw new BlendParseError(`.blend の「${file.idName(ob)}」の親子付けの種類（ボーン・頂点など）には対応していません`);
  // Blender の行列は列優先の 4x4（mat[列][行]）
  const raw = file.floats(ob, "Object", "parentinv", MATRIX_4X4_FLOATS);
  const parentInverse: Affine = {
    m: [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => raw[c * MATRIX_4X4_COLUMNS + r])),
    t: [0, 1, 2].map((r) => raw[3 * MATRIX_4X4_COLUMNS + r]),
  };
  return compose(compose(worldTransform(file, parent, depth + 1), parentInverse), local);
}

// 名前付きの属性（Blender 5.0 以降は AttributeStorage、それより前は CustomData のレイヤー）のデータのブロック
function attributeBlock(file: BlendFile, mesh: BlendBlock, name: string, customData: string): BlendBlock | null {
  if (file.has("Mesh", "attribute_storage")) {
    const count = file.int32(mesh, "Mesh", "attribute_storage.dna_attributes_num");
    const array = file.resolve(mesh, file.pointer(mesh, "Mesh", "attribute_storage.dna_attributes"));
    for (let i = 0; i < count && array; i++) {
      const nameBlock = file.resolve(array, file.pointer(array, "Attribute", "name", i));
      if (!nameBlock || file.blockString(nameBlock) !== name) continue;
      if (file.int8(array, "Attribute", "storage_type", i) !== ATTRIBUTE_STORAGE_ARRAY)
        throw new BlendParseError(`.blend のメッシュの ${name} が配列ではない形で保存されています`);
      const holder = file.resolve(array, file.pointer(array, "Attribute", "data", i));
      return holder ? file.resolve(holder, file.pointer(holder, "AttributeArray", "data")) : null;
    }
  }
  const layers = file.resolve(mesh, file.pointer(mesh, "Mesh", `${customData}.layers`));
  const total = file.int32(mesh, "Mesh", `${customData}.totlayer`);
  for (let i = 0; i < total && layers; i++) {
    if (file.string(layers, "CustomDataLayer", "name", i) === name)
      return file.resolve(layers, file.pointer(layers, "CustomDataLayer", "data", i));
  }
  return null;
}

function readMesh(file: BlendFile, mesh: BlendBlock): PolyMesh {
  const vertexCount = file.int32(mesh, "Mesh", file.memberName("Mesh", ["totvert", "verts_num"]));
  const faceCount = file.int32(mesh, "Mesh", file.memberName("Mesh", ["totpoly", "faces_num"]));
  const cornerCount = file.int32(mesh, "Mesh", file.memberName("Mesh", ["totloop", "corners_num"]));
  checkMeshSize(Math.max(0, vertexCount), Math.max(0, cornerCount));
  if (vertexCount < 0 || faceCount < 0 || cornerCount < 0)
    throw new BlendParseError(`.blend のメッシュ「${file.idName(mesh)}」の要素数が不正です`);
  if (faceCount === 0) return { positions: new Float64Array(0), faceOffsets: new Int32Array(1), cornerVerts: new Int32Array(0) };

  const offsetsName = file.memberName("Mesh", ["poly_offset_indices", "face_offset_indices"]);
  const faceOffsets = file.readInt32Array(file.resolve(mesh, file.pointer(mesh, "Mesh", offsetsName)), faceCount + 1, "面の並び");
  const vertData = file.memberName("Mesh", ["vdata", "vert_data"]);
  const cornerData = file.memberName("Mesh", ["ldata", "corner_data"]);
  const positions = file.readFloat32Array(attributeBlock(file, mesh, POSITION_ATTRIBUTE, vertData), vertexCount * 3, "頂点の位置");
  const cornerVerts = file.readInt32Array(attributeBlock(file, mesh, CORNER_VERT_ATTRIBUTE, cornerData), cornerCount, "面の頂点");

  if (faceOffsets[0] !== 0 || faceOffsets[faceCount] !== cornerCount)
    throw new BlendParseError(`.blend のメッシュ「${file.idName(mesh)}」の面の並びが不正です`);
  for (let f = 0; f < faceCount; f++) {
    if (faceOffsets[f + 1] - faceOffsets[f] < MIN_FACE_CORNERS)
      throw new BlendParseError(`.blend のメッシュ「${file.idName(mesh)}」に角が3つ未満の面があります`);
  }
  for (const v of cornerVerts) {
    if (v < 0 || v >= vertexCount) throw new BlendParseError(`.blend のメッシュ「${file.idName(mesh)}」の面の頂点番号が不正です`);
  }
  for (const value of positions) {
    if (!Number.isFinite(value)) throw new BlendParseError(`.blend のメッシュ「${file.idName(mesh)}」の頂点の位置が不正です`);
  }
  return { positions, faceOffsets, cornerVerts };
}

function pickScene(file: BlendFile) {
  const global = file.blocks.find((block) => block.code === "GLOB");
  if (global && file.structName(global) === "FileGlobal" && file.has("FileGlobal", "curscene")) {
    const scene = file.resolve(global, file.pointer(global, "FileGlobal", "curscene"));
    if (scene?.code === "SC") return { scene, global };
  }
  const scene = file.blocks.find((block) => block.code === "SC");
  if (!scene) throw new BlendParseError(".blend にシーンがありません");
  return { scene, global: null };
}

/** .blend を読み、レンダリングに出るメッシュのオブジェクトを mm のワールド座標で返す */
export function parseBlend(buf: Buffer, options: BlendReadOptions, budget = new AnalysisBudget()) {
  checkModelFileSize(buf.length);
  const file = new BlendFile(decompressBlend(buf), budget);
  const { scene, global } = pickScene(file);

  const viewLayers = [...file.list(scene, "Scene", "view_layers", budget)];
  const activeAddress =
    global && file.has("FileGlobal", "cur_view_layer") ? file.pointer(global, "FileGlobal", "cur_view_layer") : NULL_ADDRESS;
  const viewLayer = viewLayers.find((layer) => layer.address === activeAddress) ?? viewLayers[0];
  if (!viewLayer) throw new BlendParseError(".blend のシーンにビューレイヤーがありません");

  const exclude = new Set(options.excludeObjects ?? []);
  const report: BlendReport = { objects: [], hiddenObjects: 0, modifierNotes: [] };
  const meshes = new Map<number, PolyMesh>();
  const objects: NamedMesh[] = [];
  let totalVertices = 0;
  let totalTriangles = 0;

  for (const base of file.list(viewLayer, "ViewLayer", "object_bases", budget)) {
    const ob = file.resolve(base, file.pointer(base, "Base", "object"));
    if (!ob || ob.code !== "OB" || file.int16(ob, "Object", "type") !== OB_MESH) continue;
    const name = file.idName(ob);
    const rendered =
      (file.int16(base, "Base", "flag") & BASE_ENABLED_RENDER) !== 0 &&
      (file.int16(ob, "Object", "restrictflag") & OB_HIDE_RENDER) === 0;
    if (!rendered) {
      report.hiddenObjects++;
      continue;
    }
    report.objects.push({ name, excluded: exclude.has(name) });
    if (exclude.has(name)) continue;

    const meshBlock = file.resolve(ob, file.pointer(ob, "Object", "data"));
    if (!meshBlock || meshBlock.code !== "ME") throw new BlendParseError(`.blend の「${name}」のメッシュが見つかりません`);
    let mesh = meshes.get(meshBlock.index);
    if (!mesh) {
      mesh = readMesh(file, meshBlock);
      meshes.set(meshBlock.index, mesh);
    }

    for (const modifier of file.list(ob, "Object", "modifiers", budget)) {
      const structName = file.structName(modifier) ?? "";
      if ((file.int32(modifier, "ModifierData", "mode") & MODIFIER_MODE_RENDER) === 0) continue;
      if (SHAPE_NEUTRAL_MODIFIERS.has(structName)) continue;
      const label = structName.replace(MODIFIER_SUFFIX, "");
      if (structName !== SUBSURF_MODIFIER) {
        report.modifierNotes.push({ object: name, modifier: label, note: "unsupported" });
        continue;
      }
      if (file.int16(modifier, SUBSURF_MODIFIER, "subdivType") === SUBSURF_TYPE_SIMPLE) continue;
      const requested = file.int16(modifier, SUBSURF_MODIFIER, "renderLevels");
      const levels = Math.min(requested, options.maxSubdivisionLevels);
      if (levels < requested) report.modifierNotes.push({ object: name, modifier: label, note: "levels_limited" });
      mesh = catmullClark(mesh, {
        levels,
        limitSurface: (file.int16(modifier, SUBSURF_MODIFIER, "flags") & SUBSURF_FLAG_RECURSIVE) === 0,
        preserveCorners: file.int16(modifier, SUBSURF_MODIFIER, "boundary_smooth") === SUBSURF_BOUNDARY_PRESERVE_CORNERS,
        budget,
      });
    }

    const world = worldTransform(file, ob);
    const vertexCount = mesh.positions.length / 3;
    const positions = new Float64Array(mesh.positions.length);
    for (let v = 0; v < vertexCount; v++) {
      const local = [mesh.positions[v * 3], mesh.positions[v * 3 + 1], mesh.positions[v * 3 + 2]];
      const moved = apply3(world.m, local);
      for (let k = 0; k < 3; k++) positions[v * 3 + k] = (moved[k] + world.t[k]) * options.mmPerUnit;
    }

    const indices: number[] = [];
    const faceCount = mesh.faceOffsets.length - 1;
    for (let f = 0; f < faceCount; f++) {
      triangulatePolygon(positions, mesh.cornerVerts.subarray(mesh.faceOffsets[f], mesh.faceOffsets[f + 1]), indices);
    }
    // 拡縮が負（鏡映）なら、面の向きがそろうよう三角形の巡回を逆にする
    if (determinant3(world.m) < 0) {
      for (let t = 0; t < indices.length; t += 3) [indices[t + 1], indices[t + 2]] = [indices[t + 2], indices[t + 1]];
    }
    if (indices.length === 0) continue;
    totalVertices += vertexCount;
    totalTriangles += indices.length / 3;
    checkMeshSize(totalVertices, totalTriangles);
    objects.push({ name, mesh: { positions, indices: Uint32Array.from(indices), materialIndices: null } });
  }

  report.objects.sort((a, b) => a.name.localeCompare(b.name, "ja", { numeric: true }));
  if (objects.length === 0) throw new BlendParseError(".blend に表示するメッシュがありません");
  return { objects, report };
}
