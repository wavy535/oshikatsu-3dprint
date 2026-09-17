import { crc32 } from "node:zlib";
import { AR_LIMITS } from "./config.ts";
import type { ArMaterial, ArMesh } from "./mesh.ts";

// USDZ は無圧縮の ZIP で、各ファイルのデータの開始位置を64バイト境界に揃える（USDZ の仕様）。
// ZIP のヘッダーの値は ZIP の仕様で決まっている。
const USDZ_ALIGNMENT = 64;
const ROOT_LAYER = "model.usda";
const ZIP_LOCAL_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_END_SIGNATURE = 0x06054b50;
const ZIP_VERSION = 20;
const ZIP_METHOD_STORED = 0;
const ZIP_DOS_DATE_1980_01_01 = 0x21;
const ZIP_LOCAL_HEADER_BYTES = 30;
const ZIP_CENTRAL_HEADER_BYTES = 46;
const ZIP_END_BYTES = 22;
const ZIP_EXTRA_HEADER_BYTES = 4;
// 位置揃え用の extra field の ID（three.js の USDZExporter と同じ値）
const PADDING_EXTRA_FIELD_ID = 12345;
const OPAQUE_ALPHA = 1;

// lib/print と同じく、Node の型除去（--experimental-strip-types）で動く書き方にする（パラメータプロパティを使わない）
class ByteWriter {
  at = 0;
  private readonly bytes: Uint8Array<ArrayBuffer>;
  private readonly view: DataView;
  constructor(bytes: Uint8Array<ArrayBuffer>) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer);
  }
  u16(value: number) {
    this.view.setUint16(this.at, value, true);
    this.at += 2;
  }
  u32(value: number) {
    this.view.setUint32(this.at, value, true);
    this.at += 4;
  }
  write(data: Uint8Array) {
    this.bytes.set(data, this.at);
    this.at += data.length;
  }
  skip(length: number) {
    this.at += length;
  }
}

/** 無圧縮の ZIP を作る。各ファイルのデータは64バイト境界から始まる */
function storedZip(files: [name: string, data: Uint8Array][]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  let offset = 0;
  const entries = files.map(([name, data]) => {
    const nameBytes = encoder.encode(name);
    const headerEnd = offset + ZIP_LOCAL_HEADER_BYTES + nameBytes.length + ZIP_EXTRA_HEADER_BYTES;
    const padding = (USDZ_ALIGNMENT - (headerEnd % USDZ_ALIGNMENT)) % USDZ_ALIGNMENT;
    const entry = { nameBytes, data, offset, padding, crc: crc32(data) };
    offset = headerEnd + padding + data.length;
    return entry;
  });
  const centralOffset = offset;
  const centralBytes = entries.reduce(
    (sum, entry) => sum + ZIP_CENTRAL_HEADER_BYTES + entry.nameBytes.length,
    0,
  );
  const out = new Uint8Array(new ArrayBuffer(centralOffset + centralBytes + ZIP_END_BYTES));
  const writer = new ByteWriter(out);

  for (const entry of entries) {
    writer.at = entry.offset;
    writer.u32(ZIP_LOCAL_SIGNATURE);
    writer.u16(ZIP_VERSION);
    writer.u16(0); // フラグ
    writer.u16(ZIP_METHOD_STORED);
    writer.u16(0); // 時刻
    writer.u16(ZIP_DOS_DATE_1980_01_01);
    writer.u32(entry.crc);
    writer.u32(entry.data.length);
    writer.u32(entry.data.length);
    writer.u16(entry.nameBytes.length);
    writer.u16(ZIP_EXTRA_HEADER_BYTES + entry.padding);
    writer.write(entry.nameBytes);
    writer.u16(PADDING_EXTRA_FIELD_ID);
    writer.u16(entry.padding);
    writer.skip(entry.padding);
    writer.write(entry.data);
  }

  writer.at = centralOffset;
  for (const entry of entries) {
    writer.u32(ZIP_CENTRAL_SIGNATURE);
    writer.u16(ZIP_VERSION); // 作成したバージョン
    writer.u16(ZIP_VERSION); // 展開に必要なバージョン
    writer.u16(0); // フラグ
    writer.u16(ZIP_METHOD_STORED);
    writer.u16(0); // 時刻
    writer.u16(ZIP_DOS_DATE_1980_01_01);
    writer.u32(entry.crc);
    writer.u32(entry.data.length);
    writer.u32(entry.data.length);
    writer.u16(entry.nameBytes.length);
    writer.u16(0); // extra field の長さ
    writer.u16(0); // コメントの長さ
    writer.u16(0); // ディスク番号
    writer.u16(0); // 内部属性
    writer.u32(0); // 外部属性
    writer.u32(entry.offset);
    writer.write(entry.nameBytes);
  }

  writer.u32(ZIP_END_SIGNATURE);
  writer.u16(0); // このディスクの番号
  writer.u16(0); // セントラルディレクトリがあるディスク
  writer.u16(entries.length);
  writer.u16(entries.length);
  writer.u32(centralBytes);
  writer.u32(centralOffset);
  writer.u16(0); // コメントの長さ
  return out;
}

// USDA の数値。小数の桁を決めて丸め、指数表記を出さない
const number = (value: number) => String(Number(value.toFixed(AR_LIMITS.usdaDecimals)));

function primName(name: string, used: Set<string>) {
  let base = name.replace(/[^A-Za-z0-9_]/g, "_") || "Prim";
  if (/^[0-9]/.test(base)) base = `_${base}`;
  let unique = base;
  for (let i = 1; used.has(unique); i++) unique = `${base}_${i}`;
  used.add(unique);
  return unique;
}

function vectors(values: Float32Array) {
  const items: string[] = [];
  for (let i = 0; i < values.length; i += 3) {
    items.push(`(${number(values[i])}, ${number(values[i + 1])}, ${number(values[i + 2])})`);
  }
  return items.join(", ");
}

function meshPrim(mesh: ArMesh, name: string, materialPath: string) {
  const vertexCount = mesh.positions.length / 3;
  const indices = mesh.indices ?? Uint32Array.from({ length: vertexCount }, (_, i) => i);
  const faceVertexCounts = new Array(indices.length / 3).fill(3).join(", ");
  return [
    `\t\t\tdef Mesh "${name}" (`,
    `\t\t\t\tprepend apiSchemas = ["MaterialBindingAPI"]`,
    `\t\t\t)`,
    `\t\t\t{`,
    `\t\t\t\tuniform bool doubleSided = ${mesh.material.doubleSided ? 1 : 0}`,
    `\t\t\t\tint[] faceVertexCounts = [${faceVertexCounts}]`,
    `\t\t\t\tint[] faceVertexIndices = [${Array.from(indices).join(", ")}]`,
    `\t\t\t\trel material:binding = <${materialPath}>`,
    `\t\t\t\tnormal3f[] normals = [${vectors(mesh.normals)}] (`,
    `\t\t\t\t\tinterpolation = "vertex"`,
    `\t\t\t\t)`,
    `\t\t\t\tpoint3f[] points = [${vectors(mesh.positions)}]`,
    `\t\t\t\tuniform token subdivisionScheme = "none"`,
    `\t\t\t}`,
  ].join("\n");
}

function materialPrim(material: ArMaterial, name: string) {
  const [red, green, blue, alpha] = material.color;
  const path = `/Materials/${name}`;
  return [
    `\tdef Material "${name}"`,
    `\t{`,
    `\t\ttoken outputs:surface.connect = <${path}/PreviewSurface.outputs:surface>`,
    ``,
    `\t\tdef Shader "PreviewSurface"`,
    `\t\t{`,
    `\t\t\tuniform token info:id = "UsdPreviewSurface"`,
    `\t\t\tcolor3f inputs:diffuseColor = (${number(red)}, ${number(green)}, ${number(blue)})`,
    `\t\t\tfloat inputs:metallic = 0`,
    `\t\t\tfloat inputs:opacity = ${number(Math.min(alpha, OPAQUE_ALPHA))}`,
    `\t\t\tfloat inputs:roughness = ${number(material.roughness)}`,
    `\t\t\tint inputs:useSpecularWorkflow = 0`,
    `\t\t\ttoken outputs:surface`,
    `\t\t}`,
    `\t}`,
  ].join("\n");
}

/**
 * メッシュの一覧を USDA（USD のテキスト形式）にする。メートル単位・Y 軸が上。
 * Quick Look が水平な面に置くよう、three.js の USDZExporter と同じ配置の指定を入れる。
 */
export function buildUsda(meshes: ArMesh[], creator = "OshiNest AR") {
  if (meshes.length === 0) throw new Error("USDZ に書き出すメッシュがありません");
  const usedMaterialNames = new Set<string>();
  const materialNames = new Map<string, string>();
  const materials: string[] = [];
  const meshNames = new Set<string>();

  const meshPrims = meshes.map((mesh) => {
    let materialName = materialNames.get(mesh.material.name);
    if (!materialName) {
      materialName = primName(mesh.material.name, usedMaterialNames);
      materialNames.set(mesh.material.name, materialName);
      materials.push(materialPrim(mesh.material, materialName));
    }
    return meshPrim(mesh, primName(mesh.name, meshNames), `/Materials/${materialName}`);
  });

  return [
    "#usda 1.0",
    "(",
    "\tcustomLayerData = {",
    `\t\tstring creator = "${creator}"`,
    "\t}",
    '\tdefaultPrim = "Root"',
    "\tmetersPerUnit = 1",
    '\tupAxis = "Y"',
    ")",
    "",
    'def Xform "Root"',
    "{",
    '\tdef Scope "Scenes" (',
    '\t\tkind = "sceneLibrary"',
    "\t)",
    "\t{",
    '\t\tdef Xform "Scene" (',
    "\t\t\tcustomData = {",
    "\t\t\t\tbool preliminary_collidesWithEnvironment = 0",
    '\t\t\t\tstring sceneName = "Scene"',
    "\t\t\t}",
    '\t\t\tsceneName = "Scene"',
    "\t\t)",
    "\t\t{",
    '\t\t\ttoken preliminary:anchoring:type = "plane"',
    '\t\t\ttoken preliminary:planeAnchoring:alignment = "horizontal"',
    "",
    meshPrims.join("\n\n"),
    "\t\t}",
    "\t}",
    "}",
    "",
    'def "Materials"',
    "{",
    materials.join("\n\n"),
    "}",
    "",
  ].join("\n");
}

/** メッシュの一覧を USDZ（Quick Look で開けるパッケージ）にする */
export function encodeUsdz(meshes: ArMesh[]): Uint8Array<ArrayBuffer> {
  return storedZip([[ROOT_LAYER, new TextEncoder().encode(buildUsda(meshes))]]);
}
