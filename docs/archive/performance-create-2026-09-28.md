# 公開 /create の LCP 調査

> 過去の資料です。現行仕様・手順は [ドキュメント一覧](../README.md) を参照してください。計測値は記載された版・条件だけの結果です。
対象は https://oshinest.yumaboda-official.workers.dev/create 。報告値は LCP 5.21 秒、要素は `p.mt-3.mb-4.max-w-3xl.text-pretty.leading-7.text-muted-foreground`。`src/app/(shop)/create/page.tsx` の説明文と一致する。

## 結果と判断

公開版 `94e88b3e55fe163de3c6d73b07fec6e37fda5bc8` を計測したが、5.21 秒は再現しなかった。以下の変更は診断機能であり、高速化完了を意味しない。本番へのマージ・デプロイは行っていない。

Playwright Chromium、390×844、CPU 4 倍減速、CDP 設定 RTT 150ms / 下り 1.6Mbps / 上り 750kbps。各回新規ブラウザコンテキスト、キャッシュ無効、未ログイン。同一要素が LCP、CLS は全件 0。標本は各 3 回のみで、利用者全体の分位値ではない。報告者の端末・回線・ログイン状態は未確認。

| 条件 | LCP 各回 (ms) | TTFB 各回 (ms) | HTML転送本文 (bytes) |
|---|---|---|---|
| 公開版、事前 warmup なし | 1248 / 1500 / 1072 | 953 / 1277 / 859 | 11335 |
| ローカル本番ビルド、現行方式 | 456 / 360 / 352 | 26 / 20 / 21 | 12519 |
| ローカル本番ビルド、先行配信の試作（不採用） | 448 / 420 / 396 | 23 / 21 / 18 | 17553 |
| ローカル本番ビルド、診断ヘッダー追加後 | 356 / 404 / 400 | 19 / 24 / 29 | 12516 |

公開版の TTFB には DNS 45〜66ms、TCP/TLS 294〜334ms、リクエスト後の待ち 483〜876ms が含まれる。最後の値には通信も含まれ、サーバー処理時間とは断定できない。公開版とローカルは配信・圧縮環境が異なるため、互いを改善前後として比較しない。warmup を省いても Cloudflare isolate のコールドスタートを強制できるわけではない。

前の調査では公開版の warmup あり未ログイン LCP 1208〜1844ms、ログイン済み 1644〜1856ms。調査用アカウントとセッションファイルは削除済み。

## 試して戻した案

ShopLayout のヘッダーは認証・カート情報を待ち、Worker は全文をバッファして CSS 抽出・圧縮する。本文自体は静的でも、後者により全文完成まで返せない構造になっている。

試作では `/create` を別のレイアウトに移し、同じヘッダーを Suspense で囲み、Worker の全文処理をこの画面だけ通さず完全なインライン CSS を送った。URL・本文・編集機能は維持した。

通常アクセスでは TTFB の利益が小さく、転送本文が 12519→17553 bytes、LCP 中央値が 360→420ms。標本数が少ないため差の確実性は主張しないが、改善の証拠がなく採用しない。認証が特に遅い場合の利益も今回未検証。試作のレイアウト・ヘッダー・配信方式変更はすべて撤回した。

## 残した診断機能

成功した HTML 応答の `Server-Timing` にリクエスト単位で次を付加する。ユーザー情報、URL、SQL、cookie の値は出力しない。

| 名前 | 計測範囲 |
|---|---|
| ssr | vinext fetch 呼び出しから Response 取得まで |
| html | HTML ストリーム読み取り待ち |
| css | 初回 processor 準備と CSS 抽出 |
| rewrite | ヘッダー調整・HTMLRewriter と全文読み取り |
| encode | エンコーディング選択・圧縮 |
| worker | Worker 内の計測開始から応答生成までの全体 |

フォールバックでは完了した段階のみを出す。大きな文書のストリーミングでは `worker` は応答を返すまでの時間であり、その後の送信終了までを含まない。ネットワーク・Cloudflare のルーティング・Worker 起動前の時間も含まない。既存の圧縮、キャッシュ方針、認証判定、本文は維持する。

**本番計測の制約:** Cloudflare の時計は I/O 後にしか進まない。[公式ドキュメント](https://developers.cloudflare.com/workers/runtime-apis/performance/) のとおり、同期 CPU 処理をこの時計だけで計測することはできない。CSS・圧縮が `0ms` でも無料という意味ではなく、`worker` も正確な実時間の合計として扱わない。I/O 待ちの手掛かりにはなるが、CPU の判断には Cloudflare 側の CPU / wall-time メトリクスやローカル CPU プロファイルを併用する。今回の本番にはまだこのヘッダーはない。

```sh
PERF_BASE_URL=https://oshinest.yumaboda-official.workers.dev \
  PERF_WARMUP=0 PERF_RUNS=3 npm run perf:frontend -- /create
```

計測スクリプトは Server-Timing、接続時間、LCP 要素を JSON へ記録する。ログイン済みの場合は private な `PERF_STORAGE_STATE` を渡す。cookie ファイルをコミットしない。今回の匿名サンプルは [JSON](../performance-create-samples-2026-09-28.json) に保存した。

## 検証

- 単体・統合テスト 300 passed / 外部接続等 7 skipped。
- lint、型検査、本番ビルド成功。
- 本番ビルドで Playwright 14 passed（CSS 同等性、Brotli/identity 応答、Server-Timing、手動編集・Undo・保存・AR・3MF、AI チャット）。AI はモックで、実 API の課金なし。
- 診断ヘッダー追加後も説明文が同じ LCP 要素、CLS 0、ブラウザエラーなし。最終計測は LCP 中央値 400ms で、高速化の主張はしない。HTML 展開後のサイズ 59701 bytes は維持。

残件は報告された 5.21 秒の原因特定と、本番での改善確認。PR は診断の準備までであり、問題を解消した扱いにはしない。
