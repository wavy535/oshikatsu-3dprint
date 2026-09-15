// Shared by upload validation, parsers and geometry analysis. These are per file.
export const MODEL_LIMITS = {
  fileBytes: 80 * 1024 * 1024,
  xmlBytes: 64 * 1024 * 1024,
  zipEntries: 2048,
  vertices: 1_500_000,
  triangles: 500_000,
  objects: 128,
  resources: 512,
  components: 4096,
  materials: 256,
  componentDepth: 16,
  gridReferences: 4_000_000,
  candidateVisits: 50_000_000,
  analysisMs: 10_000,
  // .blend（Blender）の展開後の大きさ。形状のほかに画面の設定やプレビュー画像も入っている
  blendBytes: 256 * 1024 * 1024,
  // .blend のブロック数・DNA の要素数・リストをたどる回数の上限
  blendBlocks: 1_000_000,
  // 耳切り法で三角形に分ける多角形の角数の上限。これより多い面（円柱のふたなど）は扇形に分ける
  earClippingCorners: 256,
} as const;

export class ModelLimitError extends Error {}

export function checkModelFileSize(bytes: number) {
  if (
    !Number.isSafeInteger(bytes) ||
    bytes <= 0 ||
    bytes > MODEL_LIMITS.fileBytes
  ) {
    throw new ModelLimitError("3Dデータは80MiB以下のファイルを選んでください");
  }
}

export function checkMeshSize(vertices: number, triangles: number) {
  if (vertices > MODEL_LIMITS.vertices || triangles > MODEL_LIMITS.triangles) {
    throw new ModelLimitError(
      "3Dデータは合計50万面・150万頂点までです。面数を減らすか、パーツごとに分けてください",
    );
  }
}

/** Cooperative deadline plus deterministic work cap; no timers or background jobs. */
export class AnalysisBudget {
  private readonly deadline = performance.now() + MODEL_LIMITS.analysisMs;
  private visits = 0;

  check() {
    if (performance.now() > this.deadline) {
      throw new ModelLimitError(
        "解析時間が上限を超えました。面数を減らすか、パーツごとに分けてください",
      );
    }
  }

  visit(count: number) {
    this.visits += count;
    if (this.visits > MODEL_LIMITS.candidateVisits) {
      throw new ModelLimitError(
        "形状が複雑すぎるため解析できません。重なった面を整理するか、パーツごとに分けてください",
      );
    }
    this.check();
  }
}
