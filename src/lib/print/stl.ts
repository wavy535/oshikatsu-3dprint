import type { Mesh, NamedMesh } from "./mesh.ts";

// STL は単位も色も持たない。1オブジェクト・単色として読み込み、
// 「mm と解釈した」ことは検証の警告として別途出す。

export class StlParseError extends Error {}

function isBinaryStl(buf: Buffer): boolean {
  if (buf.length < 84) return false;
  const count = buf.readUInt32LE(80);
  return buf.length === 84 + count * 50;
}

function parseBinaryStl(buf: Buffer): Mesh {
  const count = buf.readUInt32LE(80);
  const positions = new Float64Array(count * 9);
  const indices = new Uint32Array(count * 3);

  let o = 84;
  for (let t = 0; t < count; t++) {
    // 先頭12バイトは法線。頂点の巻き順から計算し直すので読み飛ばす
    o += 12;
    for (let v = 0; v < 3; v++) {
      const base = t * 9 + v * 3;
      positions[base] = buf.readFloatLE(o);
      positions[base + 1] = buf.readFloatLE(o + 4);
      positions[base + 2] = buf.readFloatLE(o + 8);
      indices[t * 3 + v] = t * 3 + v;
      o += 12;
    }
    o += 2; // attribute byte count
  }

  return { positions, indices, materialIndices: null };
}

function parseAsciiStl(text: string): Mesh {
  const verts: number[] = [];
  const re = /vertex\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    verts.push(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  if (verts.length === 0 || verts.length % 9 !== 0) {
    throw new StlParseError("ASCII STL の頂点が読み取れません（三角形の数が合いません）");
  }
  const positions = Float64Array.from(verts);
  const indices = new Uint32Array(verts.length / 3);
  for (let i = 0; i < indices.length; i++) indices[i] = i;
  return { positions, indices, materialIndices: null };
}

export type StlDocument = {
  format: "stl";
  unit: "mm";
  unitDeclared: false;
  objects: NamedMesh[];
  materials: never[];
};

export function parseStl(buf: Buffer, fallbackName = "object"): StlDocument {
  if (buf.length < 15) throw new StlParseError("STL ファイルが小さすぎます");

  let mesh: Mesh;
  if (isBinaryStl(buf)) {
    mesh = parseBinaryStl(buf);
  } else {
    const head = buf.subarray(0, 512).toString("latin1").trimStart();
    if (!head.toLowerCase().startsWith("solid")) {
      throw new StlParseError(
        "STL として解釈できません（バイナリの三角形数とファイルサイズが一致せず、ASCII でもありません）"
      );
    }
    mesh = parseAsciiStl(buf.toString("latin1"));
  }

  return {
    format: "stl",
    unit: "mm",
    unitDeclared: false,
    objects: [{ name: fallbackName, mesh }],
    materials: [],
  };
}
