# 実AIによるサンプル制作（2026-09-29）

モデルは本番既定の `gpt-4.1-mini`。本番と同じプロンプト、スキーマ検証、自動修正ドライバ、Manifold WASM をローカルから実行した。OpenAI API は実通信。認証・D1 課金枠・公開 API 経路の試験ではない。上限12回に対し計9回で終了。アプリ本体や本番モデル設定は変更していない。

## 開ける作品

`/create` →「設計を開く・ファイルに保存」→「設計ファイル」から読み込む。各フォルダに同名の GLB、USDZ、3MF入りZIPを保存した。

| 作品 | 設計 | プレビュー | 判定 |
| --- | --- | --- | --- |
| 金色の装飾椅子 | [設計JSON](ai-samples-2026-09-29/ornate-chair.oshinest.json) | [画像](ai-samples-2026-09-29/ornate-chair.png) | 曲がった4脚と5つの巻き飾りを確認。背もたれは角張った山形で、滑らかな波形ではない。プロンプト内の既存見本と同一の造形コードであり、未知の複雑形状を設計した成果とは扱わない。 |
| 8枚花びら台座 | [設計JSON](ai-samples-2026-09-29-refined/petal-base-refined.oshinest.json) | [画像](ai-samples-2026-09-29-refined/petal-base-refined.png) | 初回は花びらのない16角形。具体的な輪郭の修正指示を追加して8枚の花びらを確認。コードの手修正はしていない。 |

椅子の実寸は約52.7×45×98mm。台座の初回45×45×6mmは指定上限内だが意図する花形ではなかった。修正版の測定値は下記 report.json に収録。色変更は初回台座に対して実施し、寸法・体積・三角形数が同じであることを確認した。

## 成功・失敗の記録

- [初回＋色編集の記録](ai-samples-2026-09-29/report.json)：6呼び出し。椅子1、装甲3（失敗）、台座1、台座の色編集1。
- [追加修正の記録](ai-samples-2026-09-29-refined/report.json)：3呼び出し。台座の輪郭修正1、装甲の再試行2（失敗）。
- `passed` は形状検証・設計の再読込・3形式への出力を通過した意味で、依頼の見た目を満たす評価ではない。初回台座がその反例。
- 装甲は本体と紋様が分離し、修正を繰り返しても完成しなかった。失敗は安全に停止したが、自動修正で成功した事例は今回得られなかった。
- 参考として既存の [手書きの装甲見本](curved-armor.oshinest.json) はあるが、今回AIが完成させたものではない。
- `response-N.json` はモデルのテキスト出力のみ。秘密鍵・内部推論は保存していない。

## 検証

- ブラウザ E2E 15件成功：画像添付、会話編集、取消、遅延応答の破棄、送信中止、日本語変換、オフライン編集、読込失敗、自動修正の停止、保存・出力。AI応答はモック、WASM は実動作。
- 今回実AIが作った4設計（初回椅子・初回台座・色編集台座・輪郭修正台座）を Chromium で読み込み、プレビュー表示、3MF ZIP のダウンロード、同梱設計の一致、ページエラーなしを確認。結果は各フォルダの `browser-checks.json`。
- TypeScript 型検査と追加スクリプトの ESLint を実施。
- 物理的な試し刷り・強度・サポート・最小肉厚、実機AR、参考画像からの実AI生成は未検証。

## 再実行

有料APIを呼ぶ。既存出力は上書きしない。初回モード最大12呼び出し、修正モード最大6呼び出しという別々の制限であり、連続実行時の合算制限はない。今回の実績は6+3=9回。

```bash
node --experimental-strip-types scripts/create-ai-samples.ts --live --out=/tmp/oshinest-samples-new
# --refine は今回保存した初回台座を入力にする再現用ケース
node --experimental-strip-types scripts/create-ai-samples.ts --live --refine --out=/tmp/oshinest-samples-refined-new
npm run preview -- --port 3000
node scripts/inspect-ai-samples.mjs /tmp/oshinest-samples-new
```

次に改善すべき点は、装飾を本体表面へ接続する生成方法と、幾何検証だけでなく見た目の要求を確かめる工程。今回の少数例から成功率やモデル間の優劣は判断しない。
