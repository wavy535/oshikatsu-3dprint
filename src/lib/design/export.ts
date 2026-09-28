import { strToU8, zipSync } from "fflate";
import { encodeGlb } from "../ar/glb.ts";
import { encodeUsdz } from "../ar/usdz.ts";
import type { ArMesh } from "../ar/mesh.ts";
import { srgbHexToLinear } from "../print/color.ts";
import { parseDesign, type Design } from "./document.ts";
import { printPositions, type DesignBuild, type PartMesh } from "./geometry.ts";

export type ExportFormat = "3mf" | "glb" | "usdz";
const xml = (s: string) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);

/** One individually printable, grounded part per 3MF. No overlapping build items. */
export function encodePart3mf(part: PartMesh): Uint8Array {
  const p = printPositions(part);
  const vertices: string[] = [], triangles: string[] = [];
  for (let i = 0; i < p.length; i += 3) vertices.push(`<vertex x="${p[i]}" y="${p[i + 1]}" z="${p[i + 2]}"/>`);
  for (let i = 0; i < part.indices.length; i += 3) triangles.push(`<triangle v1="${part.indices[i]}" v2="${part.indices[i + 1]}" v3="${part.indices[i + 2]}"/>`);
  return zipSync({
    "[Content_Types].xml": strToU8('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>'),
    "_rels/.rels": strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'),
    "3D/3dmodel.model": strToU8(`<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="ja-JP" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources><basematerials id="1"><base name="${xml(part.label)}" displaycolor="${part.color.toUpperCase()}FF"/></basematerials><object id="2" type="model" name="${xml(part.label)}" pid="1" pindex="0"><mesh><vertices>${vertices.join("")}</vertices><triangles>${triangles.join("")}</triangles></mesh></object></resources><build><item objectid="2"/></build></model>`),
  });
}

/** Common assembled geometry for both AR formats; normals are flat per triangle. */
export function arMeshes(design: Design, build: DesignBuild): ArMesh[] {
  return build.parts.map((part) => {
    const positions = new Float32Array(part.indices.length * 3), normals = new Float32Array(positions.length);
    for (let i = 0; i < part.indices.length; i++) {
      const k = part.indices[i] * 3;
      positions.set([
        (part.positions[k] + part.position[0] - design.house.width / 2) / 1000,
        (part.positions[k + 2] + part.position[2]) / 1000,
        -(part.positions[k + 1] + part.position[1] - design.house.depth / 2) / 1000,
      ], i * 3);
    }
    for (let i = 0; i < positions.length; i += 9) {
      const ax = positions[i + 3] - positions[i], ay = positions[i + 4] - positions[i + 1], az = positions[i + 5] - positions[i + 2];
      const bx = positions[i + 6] - positions[i], by = positions[i + 7] - positions[i + 1], bz = positions[i + 8] - positions[i + 2];
      const n = [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
      const length = Math.hypot(...n) || 1;
      for (let v = 0; v < 3; v++) normals.set(n.map((x) => x / length), i + 3 * v);
    }
    return { name: part.label, positions, normals, indices: null, material: { name: part.color, color: [...srgbHexToLinear(part.color)!, 1], roughness: 0.9, doubleSided: false } };
  });
}

export function exportDesign(value: unknown, build: DesignBuild, format: ExportFormat): Uint8Array {
  const design = parseDesign(value);
  if (format === "glb") return encodeGlb(arMeshes(design, build), "OshiNest design v1");
  if (format === "usdz") return encodeUsdz(arMeshes(design, build));
  if (build.issues.some((i) => i.level === "error")) throw new Error("印刷用データを出力する前に、検査の要修正項目を解消してください。");
  const files: Record<string, Uint8Array> = {
    "design.oshinest.json": strToU8(JSON.stringify(design, null, 2)),
    "README.txt": strToU8("OshiNest おうち試作\n単位: mm。各3MFは部品1個です。スライサーへ個別に読み込んでください。\n部品は接着して組み立てる前提です。接合強度・実寸・造形条件は未検証です。\n屋根の前後は開いた形です。G-code・サポート・プリンタ設定は含みません。\n色は見本です。フィラメントの割当はスライサーで行ってください。\n"),
  };
  for (const part of build.parts) files[`${part.id}.3mf`] = encodePart3mf(part);
  return zipSync(files);
}
