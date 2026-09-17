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

/**
 * AR モデルの基準点（原点）の置き方。AR ではこの点が置いた場所になり、
 * 大きさを変えてもこの点は動かない（拡大縮小の中心になる）。
 * glTF の座標では -X が左、-Z が奥、+Z が手前（開いている面）。
 */
export type ArAnchor =
  // 底面の中心。単体の作品・パーツ向け
  | "bottom-center"
  // 奥の左下の角。部屋向けで、実際の部屋の角に合わせられる
  | "back-left-bottom";

/**
 * 種類ごとの基準点。作品（購入者が見る3Dデータ）は底面の中心、
 * 部屋（仮の部屋と、実寸テストで見る手元のファイル）は角にする
 */
export const AR_ANCHOR = {
  work: "bottom-center",
  room: "back-left-bottom",
} as const satisfies Record<string, ArAnchor>;

/** AR 用モデルの URL に付ける版（rev）の元になる値 */
export const AR_MODEL = {
  // 生成処理のコードを変えて出力が変わるときに上げる。設定値の変更は rev に自動で反映される
  // 2: 3MF・.blend の色を AR に反映（色ごとにメッシュを分ける）
  generatorRevision: 2,
} as const;

export const AR_LIMITS = {
  // URL で受け取るぬいの寸法（mm）の範囲。明らかな入力ミスを弾くための値
  nuiDimensionMinMm: 10,
  nuiDimensionMaxMm: 1000,
  // 作品データを AR 用に間引くときの三角形数の上限。
  // 面ごとに頂点を分けて出すので頂点数は3倍になり、Quick Look の目安（頂点10万未満）に収まる
  workTriangleBudget: 30_000,
  // 色ごとにメッシュを分ける数の上限（これを超える色は「色の指定なし」にまとめる）
  maxColorGroups: 8,
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

/** Blender の .blend を AR 用に読むときの設定 */
export const AR_BLEND = {
  // 1 Blender 単位の長さ（mm）。部屋のデータは 1 単位 = 10cm で作られている（シーンの単位設定は 1m のまま）ため、
  // シーンの単位は使わずこの値で換算する
  mmPerUnit: 100,
  // Subdivision Surface の分割回数の上限（ファイルの指定がこれより多ければ抑える）
  maxSubdivisionLevels: 3,
} as const;

/** 作品詳細の AR 表示 */
export const AR_DISPLAY = {
  // 部屋の内寸（mm）を表示するときの小数の最大桁数。推定したぬいの寸法は 0.1mm 単位になる
  mmDecimals: 1,
  // スマホの AR に飛ぶ QR コードの画像の幅（px）と、周りの余白（モジュール数）
  qrCodeWidthPx: 200,
  qrCodeMargin: 2,
} as const;

/** 開発用の実寸テストページ（/dev/ar） */
export const AR_DEV_PAGE = {
  // QR コードの画像の幅（px）
  qrCodeWidthPx: 280,
  // QR コードの周りの余白（モジュール数）
  qrCodeMargin: 2,
  // 実寸テストに使う手元の3Dデータの置き場所。直下のフォルダ（test_3mf・roomfile など）ごとに 3MF / STL / .blend を探す。
  // プロジェクトのルートから見た場所で、Git には上げない
  localModelRoot: "local-notes",
  // 手元のファイルはサイズ展開の倍率をかけず、そのままの大きさで出す
  localModelScale: 1,
  // 寸法（mm）とファイルの大きさ（MB）を表示するときの小数の桁数
  displayDecimals: 1,
} as const;
