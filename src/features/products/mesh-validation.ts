/**
 * STEP1「3Dデータの自動検証」（Figma 2058:1033 / エラー時 2086:1314）。
 *
 * Figma が並べている 7 項目を、実際に STL のジオメトリを読んで判定する。
 * 3MF/OBJ/STEP はここではジオメトリを解析できないので、判定できない項目は
 * status: "skipped" として「未判定」であることを画面に出す。
 * 嘘の OK を出さないことが検品フロー全体の前提になるため、
 * 推定にすぎない項目（肉厚）は必ず "目安" と分かる文言にしてある。
 */

export type CheckStatus = "pass" | "fail" | "warn" | "skipped";

export type MeshCheck = {
  key: MeshCheckKey;
  label: string;
  status: CheckStatus;
  detail: string;
  /** NG のときの直し方（Figma「修正が必要な問題」表） */
  howToFix?: string;
};

export type MeshCheckKey =
  | "manifold"
  | "normals"
  | "units"
  | "wall_thickness"
  | "build_size"
  | "print_count"
  | "color_info";

export type MeshAnalysis = {
  passed: boolean;
  checks: MeshCheck[];
  triangleCount: number;
  bbox: { w: number; d: number; h: number } | null;
  shellCount: number | null;
  /** 造形サイズから概算した体積(cm3)。代行費の見積りに使う */
  volumeCm3: number | null;
};

// 運営のプリンタ造形サイズ（mm）。これを超えるモデルは受け付けない
export const BUILD_VOLUME_MM = { w: 256, d: 256, h: 256 };
// トポロジ検査を行う上限。これを超えたら bbox だけ見て残りは未判定にする
const TOPOLOGY_TRIANGLE_LIMIT = 300_000;
// 「薄すぎる」と判断する目安（mm）
const MIN_WALL_MM = 1.2;

type Triangle = {
  n: [number, number, number];
  v: [number, number, number][];
};

function parseBinaryStl(buf: ArrayBuffer): Triangle[] | null {
  if (buf.byteLength < 84) return null;
  const view = new DataView(buf);
  const count = view.getUint32(80, true);
  if (84 + count * 50 !== buf.byteLength) return null;

  const tris: Triangle[] = new Array(count);
  let o = 84;
  for (let i = 0; i < count; i++) {
    const n: [number, number, number] = [
      view.getFloat32(o, true),
      view.getFloat32(o + 4, true),
      view.getFloat32(o + 8, true),
    ];
    const v: [number, number, number][] = [];
    for (let k = 0; k < 3; k++) {
      const p = o + 12 + k * 12;
      v.push([
        view.getFloat32(p, true),
        view.getFloat32(p + 4, true),
        view.getFloat32(p + 8, true),
      ]);
    }
    tris[i] = { n, v };
    o += 50;
  }
  return tris;
}

function parseAsciiStl(text: string): Triangle[] {
  const tris: Triangle[] = [];
  const numbers = /[-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?/g;
  let current: Triangle | null = null;

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("facet normal")) {
      const m = line.match(numbers)?.map(Number) ?? [];
      current = { n: [m[0] ?? 0, m[1] ?? 0, m[2] ?? 0], v: [] };
    } else if (line.startsWith("vertex") && current) {
      const m = line.match(numbers)?.map(Number) ?? [];
      current.v.push([m[0] ?? 0, m[1] ?? 0, m[2] ?? 0]);
    } else if (line.startsWith("endfacet") && current) {
      if (current.v.length === 3) tris.push(current);
      current = null;
    }
  }
  return tris;
}

function key(p: [number, number, number]) {
  // 1e-4 mm まで丸めて同一頂点とみなす（書き出し誤差で穴が開くのを防ぐ）
  return `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)},${Math.round(p[2] * 1e4)}`;
}

function cross(a: number[], b: number[]) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function analyzeTriangles(tris: Triangle[]): {
  bbox: { w: number; d: number; h: number };
  min: number[];
  volumeCm3: number;
  openEdges: number;
  flippedNormals: number;
  degenerate: number;
  shellCount: number;
  topologyChecked: boolean;
} {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let signedVolume = 0;
  let flippedNormals = 0;
  let degenerate = 0;

  const topologyChecked = tris.length <= TOPOLOGY_TRIANGLE_LIMIT;
  const edgeUse = topologyChecked ? new Map<string, number>() : null;
  const vertexIndex = topologyChecked ? new Map<string, number>() : null;
  const parent: number[] = [];

  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }
  function union(a: number, b: number) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  }
  function vertexId(k: string) {
    let id = vertexIndex!.get(k);
    if (id === undefined) {
      id = parent.length;
      vertexIndex!.set(k, id);
      parent.push(id);
    }
    return id;
  }

  for (const t of tris) {
    for (const p of t.v) {
      for (let i = 0; i < 3; i++) {
        if (p[i] < min[i]) min[i] = p[i];
        if (p[i] > max[i]) max[i] = p[i];
      }
    }

    const [a, b, c] = t.v;
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const geo = cross(ab, ac);
    const geoLen = Math.hypot(geo[0], geo[1], geo[2]);

    if (geoLen < 1e-9) {
      degenerate++;
    } else {
      const nLen = Math.hypot(t.n[0], t.n[1], t.n[2]);
      if (nLen > 1e-9) {
        const dot =
          (t.n[0] * geo[0] + t.n[1] * geo[1] + t.n[2] * geo[2]) / (nLen * geoLen);
        // 右ねじ方向と記録された法線が逆を向いていたら面の裏返り
        if (dot < 0.5) flippedNormals++;
      }
    }

    // 符号付き体積（原点との四面体の総和）
    signedVolume +=
      (a[0] * (b[1] * c[2] - b[2] * c[1]) -
        a[1] * (b[0] * c[2] - b[2] * c[0]) +
        a[2] * (b[0] * c[1] - b[1] * c[0])) /
      6;

    if (topologyChecked) {
      const ks = t.v.map(key);
      const ids = ks.map(vertexId);
      union(ids[0], ids[1]);
      union(ids[1], ids[2]);
      for (let i = 0; i < 3; i++) {
        const k1 = ks[i];
        const k2 = ks[(i + 1) % 3];
        const edge = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
        edgeUse!.set(edge, (edgeUse!.get(edge) ?? 0) + 1);
      }
    }
  }

  let openEdges = 0;
  if (edgeUse) {
    for (const used of edgeUse.values()) {
      if (used !== 2) openEdges++;
    }
  }

  let shellCount = 1;
  if (topologyChecked && parent.length > 0) {
    const roots = new Set<number>();
    for (let i = 0; i < parent.length; i++) roots.add(find(i));
    shellCount = roots.size;
  }

  return {
    bbox: {
      w: max[0] - min[0],
      d: max[1] - min[1],
      h: max[2] - min[2],
    },
    min,
    volumeCm3: Math.abs(signedVolume) / 1000,
    openEdges,
    flippedNormals,
    degenerate,
    shellCount,
    topologyChecked,
  };
}

const SKIPPED = (key: MeshCheckKey, label: string, detail: string): MeshCheck => ({
  key,
  label,
  status: "skipped",
  detail,
});

/**
 * アップロードされたファイルを検証する。STL 以外は形式チェックのみ通し、
 * ジオメトリ項目は「未判定」として返す。
 */
export async function analyzeMesh(file: File, ext: string): Promise<MeshAnalysis> {
  if (ext !== "stl") {
    const note =
      ext === "3mf"
        ? "3MF はブラウザ側でジオメトリを解析できないため、運営が受領後に確認します"
        : `${ext.toUpperCase()} はジオメトリの自動検証に対応していません`;
    return {
      passed: true,
      triangleCount: 0,
      bbox: null,
      shellCount: null,
      volumeCm3: null,
      checks: [
        SKIPPED("manifold", "マニフォールド", note),
        SKIPPED("normals", "法線の向き", note),
        SKIPPED("units", "単位", note),
        SKIPPED("wall_thickness", "肉厚", note),
        SKIPPED("build_size", "造形サイズ", note),
        SKIPPED("print_count", "造形回数", note),
        {
          key: "color_info",
          label: "色情報",
          status: ext === "3mf" ? "pass" : "skipped",
          detail:
            ext === "3mf"
              ? "3MF なので色定義を STEP2 で割り当てられます"
              : "このファイル形式は色情報を持ちません",
        },
      ],
    };
  }

  const buf = await file.arrayBuffer();
  let tris = parseBinaryStl(buf);
  if (!tris) {
    tris = parseAsciiStl(new TextDecoder("utf-8").decode(buf));
  }

  if (tris.length === 0) {
    return {
      passed: false,
      triangleCount: 0,
      bbox: null,
      shellCount: null,
      volumeCm3: null,
      checks: [
        {
          key: "manifold",
          label: "マニフォールド",
          status: "fail",
          detail: "三角形をひとつも読み取れませんでした",
          howToFix:
            "Blender で対象のメッシュを選択し、[ファイル > エクスポート > STL] で書き出し直してください。",
        },
      ],
    };
  }

  const a = analyzeTriangles(tris);
  const checks: MeshCheck[] = [];

  // ① マニフォールド
  if (!a.topologyChecked) {
    checks.push(
      SKIPPED(
        "manifold",
        "マニフォールド",
        `三角形が ${tris.length.toLocaleString()} 個あり自動検証の上限（${TOPOLOGY_TRIANGLE_LIMIT.toLocaleString()}）を超えるため、運営が受領後に確認します`
      )
    );
  } else if (a.openEdges === 0 && a.degenerate === 0) {
    checks.push({
      key: "manifold",
      label: "マニフォールド",
      status: "pass",
      detail: "閉じた立体です（開いた辺はありません）",
    });
  } else {
    checks.push({
      key: "manifold",
      label: "マニフォールド",
      status: "fail",
      detail:
        a.openEdges > 0
          ? `開いた辺が ${a.openEdges.toLocaleString()} 本あります（穴・重なり）`
          : `面積ゼロの三角形が ${a.degenerate.toLocaleString()} 個あります`,
      howToFix:
        "Blender: 編集モードで [M > 距離で結合] → [メッシュ > ノーマル > 面の向きを外側に揃える]。" +
        "Meshmixer: [Analysis > Inspector] で Auto Repair All。",
    });
  }

  // ② 法線
  if (!a.topologyChecked) {
    checks.push(SKIPPED("normals", "法線の向き", "三角形数が多いため未判定です"));
  } else if (a.flippedNormals === 0) {
    checks.push({
      key: "normals",
      label: "法線の向き",
      status: "pass",
      detail: "すべての面が外向きです",
    });
  } else {
    const ratio = a.flippedNormals / tris.length;
    checks.push({
      key: "normals",
      label: "法線の向き",
      status: ratio > 0.01 ? "fail" : "warn",
      detail: `裏返った面が ${a.flippedNormals.toLocaleString()} 個あります`,
      howToFix:
        "Blender: 編集モードで全選択 → [Shift+N] で面の向きを再計算してください。",
    });
  }

  // ③ 単位
  const maxDim = Math.max(a.bbox.w, a.bbox.d, a.bbox.h);
  if (maxDim < 1) {
    checks.push({
      key: "units",
      label: "単位",
      status: "fail",
      detail: `全長が ${maxDim.toFixed(3)} しかありません。メートル単位で書き出されている可能性があります`,
      howToFix:
        "書き出し時の単位を mm にしてください（Blender: エクスポート設定の Scale を 1000 に）。",
    });
  } else if (maxDim > 1000) {
    checks.push({
      key: "units",
      label: "単位",
      status: "fail",
      detail: `全長が ${maxDim.toFixed(0)}mm あります。単位が mm でない可能性があります`,
      howToFix: "書き出し時の単位を mm に揃えてください。",
    });
  } else {
    checks.push({
      key: "units",
      label: "単位",
      status: "pass",
      detail: `mm 単位として妥当なサイズです（最長 ${maxDim.toFixed(1)}mm）`,
    });
  }

  // ④ 肉厚（あくまで目安。正確な最小肉厚はスライサ側でしか出せない）
  const minDim = Math.min(a.bbox.w, a.bbox.d, a.bbox.h);
  checks.push({
    key: "wall_thickness",
    label: "肉厚（目安）",
    status: minDim < MIN_WALL_MM ? "warn" : "pass",
    detail:
      minDim < MIN_WALL_MM
        ? `最も薄い方向が ${minDim.toFixed(2)}mm です。${MIN_WALL_MM}mm 未満は印刷時に欠ける場合があります`
        : `外形の最小方向は ${minDim.toFixed(1)}mm です（部分的な薄さはスライス時に確認します）`,
    howToFix:
      minDim < MIN_WALL_MM
        ? `Blender: [ソリッド化] モディファイアで厚みを ${MIN_WALL_MM}mm 以上にしてください。`
        : undefined,
  });

  // ⑤ 造形サイズ
  const overflow =
    a.bbox.w > BUILD_VOLUME_MM.w ||
    a.bbox.d > BUILD_VOLUME_MM.d ||
    a.bbox.h > BUILD_VOLUME_MM.h;
  checks.push({
    key: "build_size",
    label: "造形サイズ",
    status: overflow ? "fail" : "pass",
    detail: `${a.bbox.w.toFixed(1)} × ${a.bbox.d.toFixed(1)} × ${a.bbox.h.toFixed(1)}mm` +
      (overflow
        ? `（造形上限 ${BUILD_VOLUME_MM.w}×${BUILD_VOLUME_MM.d}×${BUILD_VOLUME_MM.h}mm を超過）`
        : ""),
    howToFix: overflow
      ? "パーツを分割して複数ファイルにするか、縮小して書き出し直してください。"
      : undefined,
  });

  // ⑥ 造形回数（分離したシェルの数 = 一度に載せるパーツ数）
  if (!a.topologyChecked) {
    checks.push(SKIPPED("print_count", "造形回数", "三角形数が多いため未判定です"));
  } else {
    checks.push({
      key: "print_count",
      label: "造形回数",
      status: a.shellCount > 12 ? "warn" : "pass",
      detail:
        a.shellCount > 1
          ? `分離したパーツが ${a.shellCount} 個あります`
          : "1 パーツで造形できます",
      howToFix:
        a.shellCount > 12
          ? "パーツが多いと造形回数が増え代行費が上がります。まとめられる部品は結合してください。"
          : undefined,
    });
  }

  // ⑦ 色情報
  checks.push({
    key: "color_info",
    label: "色情報",
    status: "skipped",
    detail: "STL は色情報を持ちません。色は STEP2 でフィラメントを割り当てます",
  });

  return {
    passed: checks.every((c) => c.status !== "fail"),
    checks,
    triangleCount: tris.length,
    bbox: a.bbox,
    shellCount: a.topologyChecked ? a.shellCount : null,
    volumeCm3: a.volumeCm3,
  };
}

/**
 * サイズ展開ごとの印刷代行費の自動算出（Figma STEP1 右カラム）。
 * 10cm を等倍として、ぬいサイズの高さ比の 3 乗で材料が増える前提で見積もる。
 * 係数は運営の実費（材料 + 機械時間）から決めた暫定値。
 */
const AGENCY_BASE_FEE = 300; // 1 ジョブあたりの固定費
const AGENCY_FEE_PER_CM3 = 12; // 材料 + 機械時間（円/cm3）

export function estimateAgencyFee(volumeCm3: number, scale: number): number {
  const scaled = volumeCm3 * scale ** 3;
  return Math.max(AGENCY_BASE_FEE, Math.round((AGENCY_BASE_FEE + scaled * AGENCY_FEE_PER_CM3) / 10) * 10);
}

/** 造形時間の概算（分）。体積 1cm3 あたり 6 分 + 段取り 20 分 */
export function estimatePrintMinutes(volumeCm3: number, scale: number): number {
  return Math.max(20, Math.round(20 + volumeCm3 * scale ** 3 * 6));
}

/** 使用フィラメント重量の概算（g）。PLA の密度 1.24g/cm3、充填 20% 想定 */
export function estimateWeightG(volumeCm3: number, scale: number): number {
  return Math.max(1, Math.round(volumeCm3 * scale ** 3 * 1.24 * 0.35));
}
