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
  roughness: 0.9,
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
} as const;
