import {
  AnalysisBudget,
  MODEL_LIMITS,
  ModelLimitError,
  checkModelFileSize,
  checkMeshSize,
} from "./limits.ts";
import { extractZipFile } from "./zip.ts";
import {
  applyTransform,
  validateMesh,
  multiplyTransform,
  parseTransform,
  type Matrix4x3,
  type Mesh,
  type NamedMesh,
} from "./mesh.ts";

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
  let i = tag.indexOf(name);
  while (i !== -1) {
    const before = i === 0 ? " " : tag[i - 1];
    if (/\s/.test(before)) {
      let at = i + name.length;
      while (/\s/.test(tag[at] ?? "")) at++;
      if (tag[at] === "=") {
        at++;
        while (/\s/.test(tag[at] ?? "")) at++;
        const quote = tag[at];
        if (quote === '"' || quote === "'") {
          const end = tag.indexOf(quote, at + 1);
          if (end !== -1) return tag.slice(at + 1, end);
        }
      }
    }
    i = tag.indexOf(name, i + name.length);
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

function eachTag(
  xml: string,
  tagName: string,
  from: number,
  to: number,
  fn: (hit: TagHit) => void,
) {
  const open = "<" + tagName;
  let i = xml.indexOf(open, from);
  while (i !== -1 && i < to) {
    const next = xml[i + open.length];
    // <triangle> と <triangles> を取り違えないよう、直後が区切り文字であることを確認
    if (
      next === " " ||
      next === "\t" ||
      next === "\n" ||
      next === "\r" ||
      next === "/" ||
      next === ">"
    ) {
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

function parseMeshBlock(
  xml: string,
  start: number,
  end: number,
  unitScale: number,
  counts: { vertices: number; triangles: number },
  budget: AnalysisBudget,
): Mesh | null {
  const vStart = xml.indexOf("<vertices", start);
  if (vStart === -1 || vStart > end) return null;
  const vEnd = xml.indexOf("</vertices>", vStart);
  const tStart = xml.indexOf("<triangles", vStart);
  if (tStart === -1 || tStart > end) return null;
  const tEnd = xml.indexOf("</triangles>", tStart);
  if (vEnd === -1 || tEnd === -1 || vEnd > end || tEnd > end)
    throw new ThreeMfParseError("3MFのメッシュ要素が閉じられていません");

  const xs: number[] = [];
  eachTag(xml, "vertex", vStart, vEnd, (hit) => {
    const x = attrNum(hit.body, "x");
    const y = attrNum(hit.body, "y");
    const z = attrNum(hit.body, "z");
    if (x === undefined || y === undefined || z === undefined)
      throw new ThreeMfParseError("3MFの頂点座標が不正です");
    counts.vertices++;
    checkMeshSize(counts.vertices, counts.triangles);
    if (counts.vertices % 4096 === 0) budget.check();
    xs.push(x * unitScale, y * unitScale, z * unitScale);
  });

  const idx: number[] = [];
  const mats: number[] = [];
  let hasMaterial = false;
  eachTag(xml, "triangle", tStart, tEnd, (hit) => {
    const a = attrNum(hit.body, "v1");
    const b = attrNum(hit.body, "v2");
    const c = attrNum(hit.body, "v3");
    if (
      ![a, b, c].every(
        (v) =>
          v !== undefined && Number.isInteger(v) && v >= 0 && v < xs.length / 3,
      )
    )
      throw new ThreeMfParseError("3MFの三角形の頂点参照が不正です");
    counts.triangles++;
    checkMeshSize(counts.vertices, counts.triangles);
    if (counts.triangles % 4096 === 0) budget.check();
    idx.push(a!, b!, c!);
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

export function parseThreeMf(
  buf: Buffer,
  budget = new AnalysisBudget(),
): ThreeMfDocument {
  checkModelFileSize(buf.length);
  const modelBuf = extractZipFile(buf, "3D/3dmodel.model");
  if (!modelBuf) {
    throw new ThreeMfParseError("3MF の中に 3D/3dmodel.model がありません");
  }
  const xml = modelBuf.toString("utf8");

  // <model> の unit
  const modelAt = xml.indexOf("<model");
  if (modelAt === -1)
    throw new ThreeMfParseError("<model> 要素が見つかりません");
  const modelTag = readTag(xml, modelAt + 6);
  const declaredUnit = modelTag ? (attr(modelTag.body, "unit") ?? null) : null;
  const unitScale = declaredUnit ? UNIT_TO_MM[declaredUnit] : 1;
  if (!unitScale) throw new ThreeMfParseError("3MFの単位に対応していません");

  // 色定義：basematerials（コア）と colorgroup（materials 拡張）の両方を見る
  const materials: ThreeMfMaterial[] = [];
  const materialKey = new Map<string, number>(); // `${groupId}:${index}` -> materials の添字

  const collectGroup = (
    openTag: string,
    childTag: string,
    closeTag: string,
    colorAttr: string,
  ) => {
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
        if (materials.length >= MODEL_LIMITS.materials)
          throw new ModelLimitError("3MFの色定義が多すぎます");
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
  const counts = { vertices: 0, triangles: 0 };
  let componentCount = 0;
  let oAt = xml.indexOf("<object");
  while (oAt !== -1) {
    const head = readTag(xml, oAt + 7);
    if (!head) break;
    budget.check();
    if (objects.size >= MODEL_LIMITS.resources)
      throw new ModelLimitError("3MFのオブジェクト定義が多すぎます");
    const id = attr(head.body, "id") ?? "";
    if (!id || objects.has(id))
      throw new ThreeMfParseError(
        "3MFのオブジェクトIDが不正または重複しています",
      );
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
      if (oEnd === -1)
        throw new ThreeMfParseError("3MFのobject要素が閉じられていません");
      const stop = oEnd;
      raw.mesh = parseMeshBlock(xml, head.end, stop, unitScale, counts, budget);
      if (raw.mesh) validateMesh(raw.mesh);
      eachTag(xml, "component", head.end, stop, (hit) => {
        if (++componentCount > MODEL_LIMITS.components)
          throw new ModelLimitError("3MFの部品参照が多すぎます");
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

  if (objects.size === 0)
    throw new ThreeMfParseError("3MF にオブジェクトが含まれていません");

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
      if (hit !== undefined)
        materials[hit].faceCount += o.mesh.indices.length / 3;
    }
  }

  // build の item を展開する。transform があれば頂点に適用してから並べる。
  const built: NamedMesh[] = [];
  const active = new Set<string>();
  let expandedVertices = 0,
    expandedTriangles = 0,
    expansions = 0;
  const append = (o: RawObject, transform: Matrix4x3 | null) => {
    if (built.length >= MODEL_LIMITS.objects)
      throw new ModelLimitError(
        "3Dデータは128パーツまでです。パーツごとに分けてください",
      );
    expandedVertices += o.mesh!.positions.length / 3;
    expandedTriangles += o.mesh!.indices.length / 3;
    checkMeshSize(expandedVertices, expandedTriangles);
    built.push({
      name: o.name,
      mesh: transform ? applyTransform(o.mesh!, transform) : o.mesh!,
    });
  };

  const expand = (
    objectId: string,
    transform: Matrix4x3 | null,
    depth: number,
  ) => {
    budget.check();
    if (
      depth > MODEL_LIMITS.componentDepth ||
      ++expansions > MODEL_LIMITS.components
    )
      throw new ModelLimitError("3MFの部品階層が複雑すぎます");
    if (active.has(objectId))
      throw new ThreeMfParseError("3MFの部品参照が循環しています");
    const o = objects.get(objectId);
    if (!o)
      throw new ThreeMfParseError(
        "3MFに存在しないオブジェクトが参照されています",
      );
    if (o.mesh) {
      append(o, transform);
      return;
    }
    if (o.components.length === 0)
      throw new ThreeMfParseError("3MFに空のオブジェクトが参照されています");
    active.add(objectId);
    for (const c of o.components) {
      const next =
        transform && c.transform
          ? multiplyTransform(c.transform, transform)
          : (c.transform ?? transform);
      expand(c.objectid, next, depth + 1);
    }
    active.delete(objectId);
  };

  const bStart = xml.indexOf("<build");
  if (bStart !== -1) {
    const bEnd = xml.indexOf("</build>", bStart);
    eachTag(xml, "item", bStart, bEnd === -1 ? xml.length : bEnd, (hit) => {
      const objectid = attr(hit.body, "objectid");
      if (!objectid)
        throw new ThreeMfParseError("3MFのbuildにオブジェクトIDがありません");
      expand(objectid, parseTransform(attr(hit.body, "transform")), 0);
    });
  }

  // build に載っていないメッシュも取りこぼさない（エクスポータによっては省略される）
  if (built.length === 0) {
    for (const o of objects.values()) {
      if (o.mesh) append(o, null);
    }
  }

  if (built.length === 0)
    throw new ThreeMfParseError("3MF に三角形メッシュが含まれていません");

  return {
    format: "3mf",
    unit: "mm",
    unitDeclared: declaredUnit !== null,
    declaredUnit,
    objects: built,
    materials: materials.filter(
      (m) => m.faceCount > 0 || materials.length <= 8,
    ),
  };
}
