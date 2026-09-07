import { extractZipFile } from "./zip";
import {
  applyTransform,
  multiplyTransform,
  parseTransform,
  type Matrix4x3,
  type Mesh,
  type NamedMesh,
} from "./mesh";

// 3MF は ZIP の中に 3D/3dmodel.model（XML）が入っている。
// 汎用の XML パーサを積むと 313,348 三角形のようなファイルで重くなるので、
// 必要なタグだけを走査する軽量スキャナで読む。

export class ThreeMfParseError extends Error {}

export type ThreeMfMaterial = {
  index: number;
  name: string;
  hex: string;
  faceCount: number;
};

export type ThreeMfDocument = {
  format: "3mf";
  unit: "mm";
  unitDeclared: boolean;
  declaredUnit: string | null;
  objects: NamedMesh[];
  materials: ThreeMfMaterial[];
};

const UNIT_TO_MM: Record<string, number> = {
  micron: 0.001,
  millimeter: 1,
  centimeter: 10,
  inch: 25.4,
  foot: 304.8,
  meter: 1000,
};

// タグ本体（<object ... > の中身）から属性を取り出す
function attr(tag: string, name: string): string | undefined {
  const key = name + '="';
  let i = tag.indexOf(key);
  while (i !== -1) {
    const before = i === 0 ? " " : tag[i - 1];
    // name="..." の name が別の属性の末尾と誤マッチしないよう境界を見る
    if (before === " " || before === "\t" || before === "\n" || before === "\r") {
      const start = i + key.length;
      const end = tag.indexOf('"', start);
      if (end === -1) return undefined;
      return tag.slice(start, end);
    }
    i = tag.indexOf(key, i + 1);
  }
  return undefined;
}

function attrNum(tag: string, name: string): number | undefined {
  const v = attr(tag, name);
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

// <tag ...> の中身（'<tag' の直後から '>' の手前まで）を返しつつ、次の探索位置を進める
type TagHit = { body: string; end: number; selfClosing: boolean };

function readTag(xml: string, at: number): TagHit | null {
  const gt = xml.indexOf(">", at);
  if (gt === -1) return null;
  let body = xml.slice(at, gt);
  const selfClosing = body.endsWith("/");
  if (selfClosing) body = body.slice(0, -1);
  return { body, end: gt + 1, selfClosing };
}

function eachTag(xml: string, tagName: string, from: number, to: number, fn: (hit: TagHit) => void) {
  const open = "<" + tagName;
  let i = xml.indexOf(open, from);
  while (i !== -1 && i < to) {
    const next = xml[i + open.length];
    // <triangle> と <triangles> を取り違えないよう、直後が区切り文字であることを確認
    if (next === " " || next === "\t" || next === "\n" || next === "\r" || next === "/" || next === ">") {
      const hit = readTag(xml, i + open.length);
      if (!hit) break;
      fn(hit);
      i = xml.indexOf(open, hit.end);
    } else {
      i = xml.indexOf(open, i + open.length);
    }
  }
}

type RawObject = {
  id: string;
  name: string;
  pid: string | null;
  pindex: number | null;
  mesh: Mesh | null;
  components: { objectid: string; transform: Matrix4x3 | null }[];
};

function parseMeshBlock(xml: string, start: number, end: number, unitScale: number): Mesh | null {
  const vStart = xml.indexOf("<vertices", start);
  if (vStart === -1 || vStart > end) return null;
  const vEnd = xml.indexOf("</vertices>", vStart);
  const tStart = xml.indexOf("<triangles", vStart);
  if (tStart === -1 || tStart > end) return null;
  const tEnd = xml.indexOf("</triangles>", tStart);
  if (vEnd === -1 || tEnd === -1) return null;

  const xs: number[] = [];
  eachTag(xml, "vertex", vStart, vEnd, (hit) => {
    const x = attrNum(hit.body, "x");
    const y = attrNum(hit.body, "y");
    const z = attrNum(hit.body, "z");
    if (x === undefined || y === undefined || z === undefined) return;
    xs.push(x * unitScale, y * unitScale, z * unitScale);
  });

  const idx: number[] = [];
  const mats: number[] = [];
  let hasMaterial = false;
  eachTag(xml, "triangle", tStart, tEnd, (hit) => {
    const a = attrNum(hit.body, "v1");
    const b = attrNum(hit.body, "v2");
    const c = attrNum(hit.body, "v3");
    if (a === undefined || b === undefined || c === undefined) return;
    idx.push(a, b, c);
    const p1 = attrNum(hit.body, "p1");
    if (p1 !== undefined) hasMaterial = true;
    mats.push(p1 ?? -1);
  });

  if (xs.length === 0 || idx.length === 0) return null;

  return {
    positions: Float64Array.from(xs),
    indices: Uint32Array.from(idx),
    materialIndices: hasMaterial ? Int32Array.from(mats) : null,
  };
}

export function parseThreeMf(buf: Buffer): ThreeMfDocument {
  const modelBuf = extractZipFile(buf, "3D/3dmodel.model");
  if (!modelBuf) {
    throw new ThreeMfParseError("3MF の中に 3D/3dmodel.model がありません");
  }
  const xml = modelBuf.toString("utf8");

  // <model> の unit
  const modelAt = xml.indexOf("<model");
  if (modelAt === -1) throw new ThreeMfParseError("<model> 要素が見つかりません");
  const modelTag = readTag(xml, modelAt + 6);
  const declaredUnit = modelTag ? attr(modelTag.body, "unit") ?? null : null;
  const unitScale = declaredUnit ? UNIT_TO_MM[declaredUnit] ?? 1 : 1;

  // 色定義：basematerials（コア）と colorgroup（materials 拡張）の両方を見る
  const materials: ThreeMfMaterial[] = [];
  const materialKey = new Map<string, number>(); // `${groupId}:${index}` -> materials の添字

  const collectGroup = (openTag: string, childTag: string, closeTag: string, colorAttr: string) => {
    let g = xml.indexOf(openTag);
    while (g !== -1) {
      const head = readTag(xml, g + openTag.length);
      if (!head) break;
      const groupId = attr(head.body, "id") ?? "";
      const gEnd = xml.indexOf(closeTag, head.end);
      const stop = gEnd === -1 ? xml.length : gEnd;
      let localIndex = 0;
      eachTag(xml, childTag, head.end, stop, (hit) => {
        const raw = attr(hit.body, colorAttr) ?? "#CCCCCC";
        const hex = ("#" + raw.replace("#", "").slice(0, 6)).toUpperCase();
        materialKey.set(`${groupId}:${localIndex}`, materials.length);
        materials.push({
          index: materials.length,
          name: attr(hit.body, "name") ?? `色 ${materials.length + 1}`,
          hex,
          faceCount: 0,
        });
        localIndex++;
      });
      g = xml.indexOf(openTag, stop);
    }
  };

  collectGroup("<basematerials", "base", "</basematerials>", "displaycolor");
  collectGroup("<m:colorgroup", "m:color", "</m:colorgroup>", "color");
  collectGroup("<colorgroup", "color", "</colorgroup>", "color");

  // オブジェクト
  const objects = new Map<string, RawObject>();
  let oAt = xml.indexOf("<object");
  while (oAt !== -1) {
    const head = readTag(xml, oAt + 7);
    if (!head) break;
    const id = attr(head.body, "id") ?? "";
    const raw: RawObject = {
      id,
      name: attr(head.body, "name") ?? `object_${objects.size + 1}`,
      pid: attr(head.body, "pid") ?? null,
      pindex: attrNum(head.body, "pindex") ?? null,
      mesh: null,
      components: [],
    };

    if (!head.selfClosing) {
      const oEnd = xml.indexOf("</object>", head.end);
      const stop = oEnd === -1 ? xml.length : oEnd;
      raw.mesh = parseMeshBlock(xml, head.end, stop, unitScale);
      eachTag(xml, "component", head.end, stop, (hit) => {
        raw.components.push({
          objectid: attr(hit.body, "objectid") ?? "",
          transform: parseTransform(attr(hit.body, "transform")),
        });
      });
      oAt = xml.indexOf("<object", stop);
    } else {
      oAt = xml.indexOf("<object", head.end);
    }

    if (id) objects.set(id, raw);
  }

  if (objects.size === 0) throw new ThreeMfParseError("3MF にオブジェクトが含まれていません");

  // 色スロットごとの面数を数える（どの色が主役かを出すため）
  for (const o of objects.values()) {
    if (!o.mesh) continue;
    const groupId = o.pid ?? "";
    if (o.mesh.materialIndices) {
      for (const p of o.mesh.materialIndices) {
        if (p < 0) continue;
        const hit = materialKey.get(`${groupId}:${p}`);
        if (hit !== undefined) materials[hit].faceCount++;
      }
    } else if (o.pindex !== null) {
      const hit = materialKey.get(`${groupId}:${o.pindex}`);
      if (hit !== undefined) materials[hit].faceCount += o.mesh.indices.length / 3;
    }
  }

  // build の item を展開する。transform があれば頂点に適用してから並べる。
  const built: NamedMesh[] = [];
  const seen = new Set<string>();

  const expand = (objectId: string, transform: Matrix4x3 | null, depth: number) => {
    if (depth > 8) return;
    const o = objects.get(objectId);
    if (!o) return;
    if (o.mesh) {
      built.push({
        name: o.name,
        mesh: transform ? applyTransform(o.mesh, transform) : o.mesh,
      });
      seen.add(objectId);
      return;
    }
    for (const c of o.components) {
      const next =
        transform && c.transform
          ? multiplyTransform(c.transform, transform)
          : c.transform ?? transform;
      expand(c.objectid, next, depth + 1);
    }
  };

  const bStart = xml.indexOf("<build");
  if (bStart !== -1) {
    const bEnd = xml.indexOf("</build>", bStart);
    eachTag(xml, "item", bStart, bEnd === -1 ? xml.length : bEnd, (hit) => {
      const objectid = attr(hit.body, "objectid");
      if (!objectid) return;
      expand(objectid, parseTransform(attr(hit.body, "transform")), 0);
    });
  }

  // build に載っていないメッシュも取りこぼさない（エクスポータによっては省略される）
  if (built.length === 0) {
    for (const o of objects.values()) {
      if (o.mesh) built.push({ name: o.name, mesh: o.mesh });
    }
  }

  if (built.length === 0) throw new ThreeMfParseError("3MF に三角形メッシュが含まれていません");

  return {
    format: "3mf",
    unit: "mm",
    unitDeclared: declaredUnit !== null,
    declaredUnit,
    objects: built,
    materials: materials.filter((m) => m.faceCount > 0 || materials.length <= 8),
  };
}
