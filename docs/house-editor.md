# ブラウザ制作機能

`/create` で寸法と部品を編集し、同じ設計から印刷用・AR用ファイルを作る。手動編集は匿名で利用でき、AI送信には一般会員ログインが必要。

## 操作と保存

- おうちの幅・奥行・高さ・板厚、壁・屋根・窓・棚、部品の色と位置を編集する。窓・追加家具は [部品仕様](ai-design-parts.md) を参照。
- 単体モードは床・壁・屋根を出力せず、元のおうち設定を保持する。複合部品・コードによる自由形状は [自由形状](freeform-modelling.md) を参照。
- 取り消し・やり直しは50件。保存ボタンで端末内に1件保存できる。JSON読込は128KiBまでで、形式・版・値の範囲を検証する。クラウド保存ではない。
- 部品別3MFと設計JSONをまとめたZIP、組立状態のGLB/USDZを書き出す。印刷用の部品は回転して接地する。
- 初回読込後の手動編集・保存はオフラインで動く。オフラインでの新規起動は保証していない。

## 実装の分担

| ファイル | 処理 |
| --- | --- |
| `src/lib/design/document.ts` | 設計形式・値の制約・配置検査・履歴・revision |
| `src/lib/design/protocol.ts` | Workerとの要求・応答形式 |
| `src/lib/design/parts.ts` / `geometry.ts` | 部品定義とManifold形状生成 |
| `src/lib/design/worker-client.ts` | 処理の集約・書き出し優先・タイムアウト |
| `src/lib/design/export.ts` | 3MF ZIP・GLB・USDZ |
| `src/components/design/` | 編集・チャット・Three.js表示 |

コアはReact・DOMに依存せず、CLIからも同じ処理を使う。Three.jsは操作時に描画し、Manifold WASMは専用Web Workerで動く。トップページで制作エンジンを読み込まない。

形状キャッシュは32件。色・表示位置だけの変更では形状を再生成しない。Workerは実行中1件と最新プレビュー1件に集約し、書き出しを優先する。20秒で応答しなければ停止し、設計を保持して再試行できる。古い結果を反映せず、WASM・Three.jsの資源とBlob URLを解放する。

## CLI

Node.js 24を使う。既存出力ファイルは上書きしない。

```bash
npm run design:export -- house.oshinest.json parts.zip
npm run design:export -- house.oshinest.json house.glb
npm run design:export -- house.oshinest.json house.usdz
npm run benchmark:design
```

## 制約

基本のおうちは接着組立の試作で、ジョイント・公差設計はない。最小板厚2mm・造形領域256mm角は暫定値。ぬいの寸法比較だけでは、部品との干渉やぬいの変形は判断できない。強度、スライサーでの読込、実プリント、実機ARは別途確認が必要。

制作から公開・注文への自動連携は未実装。既存投稿へ持ち込む場合もサーバーの検証を通す。ブラウザの形状検査に通っても、製造を承認したことにはならない。

テストの内容と実行方法は [テスト文書](testing.md)、サンプルは [一覧](examples/README.md) を参照。
