// AR プレビューの設定値。数値はここだけで持つ。
// 仮の部屋の余白・厚みは仕様が決まっていない仮の値なので、決まったらここを直す。

/** 仮の部屋の寸法（mm）。ぬいの目安の箱の周りに余白を取って内寸を決める */
export const AR_ROOM = {
  sideMarginMm: 20,
  frontMarginMm: 30,
  backMarginMm: 20,
  topMarginMm: 30,
  wallThicknessMm: 4,
  floorThicknessMm: 4,
  ceilingThicknessMm: 2,
} as const;

/** 色は glTF の baseColorFactor（リニア RGB と不透明度） */
export const AR_MATERIALS = {
  floor: [0.8, 0.72, 0.6, 1],
  wall: [0.95, 0.93, 0.9, 1],
  ceiling: [0.8, 0.9, 1, 0.15],
  nuiGuide: [1, 0.45, 0.62, 0.35],
  work: [0.9, 0.9, 0.9, 1],
  calibration: [0.15, 0.55, 1, 0.45],
  roughness: 0.9,
} as const;

/** 校正用モデル（開発用の実寸テスト）。A4 用紙（ISO 216）と同じ大きさの薄い板 */
export const AR_CALIBRATION = {
  a4LongMm: 297,
  a4ShortMm: 210,
  plateThicknessMm: 1,
} as const;

/** AR 用モデルの URL に付ける版（rev）の元になる値 */
export const AR_MODEL = {
  // 生成処理のコードを変えて出力が変わるときに上げる。設定値の変更は rev に自動で反映される
  generatorRevision: 1,
} as const;

export const AR_LIMITS = {
  // URL で受け取るぬいの寸法（mm）の範囲。明らかな入力ミスを弾くための値
  nuiDimensionMinMm: 10,
  nuiDimensionMaxMm: 1000,
  // 作品データを AR 用に間引くときの三角形数の上限。
  // 面ごとに頂点を分けて出すので頂点数は3倍になり、Quick Look の目安（頂点10万未満）に収まる
  workTriangleBudget: 30_000,
  // 間引きに使う格子の分割数（いちばん長い辺を何分割するか）の探索範囲
  decimateMinResolution: 8,
  decimateMaxResolution: 4096,
  // GLB をブラウザ・CDN にキャッシュさせる秒数
  cacheSeconds: 3600,
  // URL に付ける元データの版（ハッシュの先頭の桁数）
  assetVersionLength: 16,
  // USDA に書く座標・色の小数の桁数（メートル単位で µm まで）
  usdaDecimals: 6,
} as const;

/** 作品詳細の AR 表示 */
export const AR_DISPLAY = {
  // 部屋の内寸（mm）を表示するときの小数の最大桁数。推定したぬいの寸法は 0.1mm 単位になる
  mmDecimals: 1,
} as const;

/** 開発用の実寸テストページ（/dev/ar） */
export const AR_DEV_PAGE = {
  // QR コードの画像の幅（px）
  qrCodeWidthPx: 280,
  // QR コードの周りの余白（モジュール数）
  qrCodeMargin: 2,
  // 実寸テストに使う手元の3Dデータの置き場所。直下のフォルダ（test_3mf・roomfile など）ごとに 3MF / STL を探す。
  // プロジェクトのルートから見た場所で、Git には上げない
  localModelRoot: "local-notes",
  // 手元のファイルはサイズ展開の倍率をかけず、そのままの大きさで出す
  localModelScale: 1,
  // 寸法（mm）とファイルの大きさ（MB）を表示するときの小数の桁数
  displayDecimals: 1,
} as const;
