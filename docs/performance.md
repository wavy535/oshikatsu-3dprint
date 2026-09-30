# 性能設計と計測

性能変更は、表示内容・認証・データ条件を保った比較で判定する。LCP、画面内遷移、制作操作の反映時間、形状計算を別の指標として扱う。

## 採用している対策

| 対策 | 理由・維持する条件 |
| --- | --- |
| セッションCookieがない要求では認証初期化を省く | 匿名表示の不要なD1往復を避ける。CookieありはDBセッション・失効を検証する |
| スキーマ照合の集約、セッションと会員のJOIN | DB往復を減らす。実スキーマの検査は維持する |
| 認証・プロフィール・共通ナビを `cacheForRequest` で共有 | 同一要求の重複取得を避ける。利用者情報を要求間で共有しない |
| Workerの配置ヒントをSIN近傍へ指定 | D1 primaryとの往復を短くする。`wrangler.jsonc` が正本 |
| 必要CSSを初回HTMLに含める | 別CSS取得の待ちと全文CSSの転送量を抑える。完全CSSとの表示同等性を検査する |
| 小さいHTMLをBrotli圧縮し `no-transform` を付ける | 配信時の再圧縮を防ぐ。元のキャッシュ方針と圧縮非対応時の表示を維持する |
| 制作エンジンを遅延読込、形状をキャッシュ | トップで不要なWASMを取得しない。変更対象と書き出しの版を一致させる |

`npm run build` はViteの後に `scripts/build-critical-css.mjs` を実行する。`vite build` 単独では後処理を省いてしまう。

HTML最適化は成功した小さいGET HTMLだけに適用する。256KiB超は欠損なく元のストリームを継続し、API・RSC・Server Action・ファイルには適用しない。抽出失敗時は完全CSS、圧縮失敗時は通常配信へ戻る。`@property` と単独擬似クラスの補正を依存更新時にも確認する。

## 計測

本番ビルドで測り、対象版、認証状態、画面幅、CPU・回線条件、キャッシュ、warmup、試行数を固定する。計測中にビルド・別試験を走らせない。ログインへのリダイレクトや非200応答を高速な結果に数えない。

```bash
npm run build
npm run preview -- --port 3000
# 別ターミナル
PERF_BASE_URL=http://localhost:3000 npm run perf:frontend -- / /works /create
PERF_BASE_URL=http://localhost:3000 npm run perf:navigation
npm run benchmark:design
npm run benchmark:print
```

会員の計測には `PERF_STORAGE_STATE` で認証済みstorage stateを渡す。Cookieを含むため、リポジトリ外・所有者のみ読める場所に保存し、終了後に削除する。

成功HTMLの `Server-Timing` はssr / html / css / rewrite / encode / workerを記録する。Cloudflareの時計では同期CPU処理の内訳を正確に測れないため、0msを処理コストゼロと解釈しない。CPU判断にはプロファイルや基盤のメトリクスを併用する。

## 既存の証拠と残件

2026-09-28の公開ラボ計測では主要9画面のLCP中央値764〜972ms（各3回）、最大1384ms。全利用者・全アクセスの保証ではなく、現在の配備版を再計測した値でもない。`/create` の報告値5.21秒は当時の計測で再現せず、原因特定と公開環境での改善確認が残る。

主要9画面の比較条件・全試行は [計測JSON](performance/lcp-subsecond-2026-09-28.json)、`/create` の計測値は [診断JSON](performance-create-samples-2026-09-28.json) を参照する。ローカルと公開環境、未ログインと会員、異なる配信経路を改善前後として混ぜない。CSSの自動比較は表示同等性を検査するが、意図したデザインへの適合や実ユーザー性能は別評価。
