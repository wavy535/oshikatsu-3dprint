# 2026-09-28: ブラウザ制作機能をPR用ブランチに実装

- `feat/browser-house-editor` に `/create` を追加。TypeScriptのヘッドレスコア、Manifold WASMのWeb Worker、Three.js表示。寸法・部品編集、履歴、端末保存、JSON、部品別3MF ZIP、GLB/USDZ・ARデータ生成に対応。
- 設計・採用理由・計測・制約は [ブラウザ制作機能](docs/house-editor.md)。実機AR・実プリントは未検証。AI生成・自動出品・注文連携は対象外。
- 単体289件成功（外部サービス7件対象外）、型・lint・ビルド成功、audit検出0件。ブラウザ試験14件で制作操作と既存画面の回帰を確認。
- ユーザー指示はブランチを切りPR経由でマージできる状態まで。マージ・本番配備は行わない。既存masterは作業開始前に `5bc751d` までpush済み。以下の「push未実施」は当時の記録。

# 2026-09-28: トップページを再設計して公開

- トップを、青いおうち・家具の構成図、身長とカテゴリの組み合わせ検索、用途別の一覧、寸法ガイドに再構成。SVGとHTMLのGETフォームで動き、追加の画像・フォント・3Dビューアは読み込まない。準備公開中・デモ注文・AI未実装・申請停止の条件は維持。
- 公開サイトのLCP中央値はスマホ956→880ms、PC928→944ms。同じCPU 4倍・下り1.6Mbps・latency150ms・新規コンテキスト・キャッシュ無効、各3回。両幅で中央値1秒未満、CLS0。単発1152msもあるため全アクセスの保証ではない。[検証記録](docs/home-redesign-2026-09-28.md)。
- 型・lint・本番ビルド成功。本番ビルドでPlaywright8件、公開サイトで5件成功。JavaScript無効時の検索、320pxの表示、主要ボタンのコントラスト、既存6画面の必要CSSと全CSSの一致も確認。
- Web version `869d6a6b-d4fd-4c55-b013-e8ea97580232`、公開URL: https://oshinest.yumaboda-official.workers.dev 。`6d4ec8d`（画面）、`8a523bf`（検索試験）をコミットして配備。GitHubへのpushは未実施。DB・secret・Geometryは未変更、計測用会員の作成も不要だった。
- トップの最新の判断は [UIの判断基準の冒頭](docs/ui-redesign.md#現在のトップページ) を優先する。以下は以前の作業記録。

# 2026-09-28: 主要画面のLCP中央値1秒未満を達成

- ユーザーの「1秒切ってください」に対し、会員6画面・未ログイン3画面でLCP中央値764〜972msを確認。通知設定2212→960ms、会員の作品一覧3292→972ms、マイページ2780→928ms。同じCPU 4倍・下り1.6Mbps・latency 150ms・新規コンテキスト・キャッシュ無効、各3回。単発では1384msもあり、全アクセス1秒未満の保証ではない。
- 画面内移動も計測し、通知設定2024→856ms、購入履歴1424→572ms、カート1443→542ms、作品一覧1226→574ms。通常のブラウザキャッシュありの別指標。詳しい条件・全試行・中間版は[最新の性能記録](docs/performance-subsecond-2026-09-28.md)。
- Smart Placementが呼び出し数不足で働いていなかったため、D1 primaryのSINに近い `placement.region = "aws:ap-southeast-1"` を指定。Cloudflare内の配置ヒントで、AWSリソースの作成・利用ではない。
- `experimental.inlineCss` と、ビルド時のBeastiesプラン＋実行時の必要CSS抽出を追加。小さい成功HTMLだけが対象。API/RSC/Server Action/ファイルは通常処理、256KiB超はストリームを維持。初回に不要な全CSSのHTTP preloadを除去し、Brotli圧縮と `no-transform` でエッジの再圧縮も防いだ。`npm run build` の後処理を省略しない。
- CSS抽出器0.5.4の `@property` と単独擬似クラスの扱いを補正。6画面をスマホ/PC・JavaScript無効で完全CSSと比較する試験を維持する。CloudflareのAccept-Encoding正規化でq値が失われる制約は性能記録に記載。認証DB検証・失効確認・スキーマ照合・青の配色を維持した。
- 型・lint・本番ビルド成功。Vitest279件成功（外部サービス7件対象外）、本番ビルドのブラウザ12件、公開UI3件成功。最終LCP27試行・画面内移動15試行でブラウザエラーなし。
- Web version `6eb0f51f-28f5-4b53-b010-b7363ce44c52`、100%配信。公開URL: https://oshinest.yumaboda-official.workers.dev 。D1スキーマ・secret・Geometry・既存会員データは未変更。
- 配置、インラインCSS、必要CSS抽出、先読み除去、HTML圧縮、配信時の圧縮維持、計測ツールを分割してコミット済み。Cloudflareへの実配備まで実施。GitHubへのpushは未実施。
- 自分で作った計測会員1件を限定削除。関連セッション・認証アカウント・プロフィール0件、DBコンテキストが `app_guest`、削除済みセッションのログイン誘導を確認。Cookie・生ログを削除し、自分のWranglerプレビュー・tailを停止。既存stash、`refactoring`、他のDockerサービスは保持。
- メール未確認の一般会員登録、クリエイター申請停止、デモ決済、AIモデリング未実装の公開条件は維持。以下は過去の記録。

# 2026-09-28: 会員の通知設定のLCP改善・青の配色を公開

- ユーザーの報告は公開サイトの `/mypage/notification-settings`。匿名ページの前回計測では対象外だった。認証済みの同じ会員で再現し、スマホでは報告と同じ説明文がLCP対象となった。
- D1の認証スキーマ照合を5テーブルの1クエリに集約し、Better AuthのJOIN取得を有効化。ただし、この段階のLCPは7140→6912msで大きく改善せず、原因を追加調査した。
- ローカル本番ビルドの単一HTTP GETで認証6回・プロフィール3回・共通ナビ3回を確認。`React.cache` ではこの非同期経路をまとめられなかった。3 readerをvinextの `cacheForRequest` に変更し、各1回に減った。別リクエストには共有しない。一時的な計測ログは削除済み。
- 公開スマホラボ計測のLCP中央値7140→2484ms、PC6508→2636ms。同じ会員、CPU 4倍、下り1.6Mbps、latency 150ms、キャッシュ無効、各3回。2.5秒以下を常に保証する結果ではない。[条件・全試行・判断](docs/performance-member-2026-09-28.md)。
- 青 `#1d4ed8` を主要操作・選択状態に採用。白地・濃い文字・罫線中心の構成を維持。通知設定の内容と操作は維持。
- 型・lint・Vitest273件・本番ビルド、本番ビルドのブラウザ15件、公開UI3件とアクセス制限を確認。通知保存、会員分離、セッション失効の再検証、失敗後の再試行も検証済み。
- Web version `88e558ee-1a94-4d7e-8399-f0f7291bdd3a`、deployment `6fd3b5c5-ddb3-44d3-8d03-5dbb063f39d6`、100%配信。公開URL: https://oshinest.yumaboda-official.workers.dev 。DBスキーマ・secret・Geometryは未変更。
- `80954a9`（D1読み取り）、`0c29c92`（青の配色）、`5cda2ba`（リクエスト内の重複除去）をコミット・配備済み。GitHubへのpushは未実施。
- 計測専用会員1件はID・メール・名前で限定して削除。関連セッション・アカウント・プロフィールは0件、DB実行コンテキストは `app_guest` を確認。ローカル試験用のWranglerとGeometryを停止。既存データ・他のDockerサービス・stash・refactoringブランチは保持。
- メール未確認での一般会員登録、クリエイター申請停止、デモ注文、AI未実装の条件は維持。以下は過去の記録。

# 2026-09-28: LCP改善・UIの再評価を公開

- ユーザーの「LCPが悪い」「淡色・角丸・AI slopっぽい」という指摘を受け、公開環境を計測し、Web上のデザイン批評・一次資料と前回の画面を照合した。前回案を維持せず、白地・墨色・罫線中心、身長/カテゴリから探すUIへ変更した。判断理由・出典は [UI再設計](docs/ui-redesign.md)。
- 匿名のページ表示時、Better Auth初期化に伴うD1スキーマ照合（65テーブル）が不要に走っていた。セッションCookieなしだけ初期化を省き、Cookieありの検証・認可は維持。ナビゲーション等の余分なprefetchも削減。
- 公開環境のスマホラボ計測（390px、CPU 4倍減速、下り1.6Mbps、latency 150ms、キャッシュなし、各3回）で、LCP中央値はトップ2384→1148ms、作品一覧2640→1636ms。ログイン1312→1296msはほぼ同じ。実利用者の指標ではない。[全条件・結果](docs/performance-2026-09-28.md)。
- 最新Webバージョン `60a79cde-5532-4247-90c8-93d017c7241b`、deployment `fceb057e-6450-4d79-97ac-620ee50eee7a`、100%配信。公開URL: https://oshinest.yumaboda-official.workers.dev 。DB・secret・Geometryは未変更。
- 型・lint・266件のVitest・本番ビルド・dry runが成功。PC/スマホ14画面の表示、本番ビルドのブラウザ14件（ゲスト2件対象外）、公開先UI試験3件、アクセス制限を確認。
- `4b245a9` は匿名認証の高速化・回帰テスト・計測ツール、`1642de3` はUIとナビゲーションの再構成。ローカルコミットとCloudflare配備まで完了、GitHubへのpushは未実施。
- メール未確認の一般会員登録、クリエイター申請停止、デモ注文、AI未実装の条件は維持。以下の記録は過去の状態。

# 2026-09-28: UI再設計を公開

- 「全体的にUIが見づらい」という依頼を受け、文字・配色・余白・操作部品を全画面で見直し、トップ・検索・登録・マイページ・ナビゲーションを再構成した。正本と判断理由は [UI再設計](docs/ui-redesign.md)。Figmaの旧稿は未変更。
- 公開URL: https://oshinest.yumaboda-official.workers.dev 。最新Webバージョン `7b18ab57-5a12-430d-b7a2-a1a56e6fc7f5`、100%配信。
- 型・lint・260件のVitest・本番ビルド・dry runが成功。本番ビルドのブラウザ14件成功（隔離ゲスト2件対象外）、20画面のモバイル表示、公開先のUI試験3件とアクセス制限を確認。
- `535e4b4` は文字・コントラスト・共通部品、`2a211e5` はナビゲーション・主要画面と試験。コミットとCloudflare配備まで完了し、GitHubへのpushは未実施。
- Cloudflare構成、メール未確認の一般会員登録、クリエイター申請停止、デモ決済の条件は維持。AI生成は未実装。DB・本番会員データやsecretの変更はしていない。
- 以下はD1初回公開と、それ以前の記録。最新の画面と配備状態は上記を優先する。

# 2026-09-28: D1・メールなしの一般会員環境

- 最新の合意は **Cloudflare完結、既存データ移行なし、メール未確認の一般会員登録を許可、クリエイター申請停止**。以前のNeon・Resend・Twilioの準備は不要。
- Workers / D1 / 非公開R2 / 非公開Containers。AI生成は設計まで、実決済・送金なし。
- D1の移植と検証は [移行記録](docs/d1-migration.md)、配備状況と操作は [Cloudflare配備手順](infra/cloudflare/README.md) を正本とする。
- 対象アカウントは `yumaboda.official@gmail.com` / `1c93af48e1a5c2e163edc9030cff4647`。Web・D1・R2・Geometryすべて配備済み。公開URLは https://oshinest.yumaboda-official.workers.dev 。Webバージョン `a62adbe1-adce-4211-953a-122ba1791097`。AUTH_SECRET登録済み。認証のやり直しやDB再作成は不要。
- DBの更新は `atomicBatch`。対話的なtransaction・FOR UPDATEを使わない。読み取り可視性と書込みトリガーを維持し、任意SQLをブラウザへ公開しない。
- 通常開発はローカルD1。PostgreSQLは固定した旧実装との比較用のみ。既存のPostgreSQL/S3ボリューム、stash、`refactoring` ブランチは保持する。
- 型・lint・Vitest 258件・互換性15項目・ビルド・dry run、本番ビルドでブラウザ11件が成功。隔離ゲスト2件は今回対象外。依存監査0件。
- リモートD1は全8マイグレーション適用済み。CASE/ENDのSQL分割対策を追加し、D1関連43件と新規2件、型・lintを再確認。公開先で登録・再ログイン・申請停止など実ブラウザ9項目とHTTPのアクセス制限を確認し、確認用会員は削除済み。
- GitHubの既定ブランチは `main` ではなく `master`。`origin/master` の最新 `85f3dea` から論理単位でコミット済み。今回の変更はローカルコミットとCloudflare実配備までで、GitHubへのpushはしていない。
- 以下は移行前の履歴。構成・公開条件・検証結果は上記の最新資料を優先する。

# 2026-09-27: Cloudflare向け構成への変更

- 実行系はvinext/Vite + Workers。`next/*` APIは互換実装、Next.jsは型・lint用の開発依存。
- 非公開R2、Hyperdrive + AWS外のPostgreSQL、ContainersのGeometry Workerへ分離。
- `npm run cf:types`で型を生成。ローカルは`.dev.vars`を必ず用意し、管理用`.env.local`と分離する。
- `npm run dev:geometry`と`npm run dev`を別プロセスで起動。DBは既存のDocker Compose。
- [構成選定・AI制作の設計](docs/product-architecture.md)、[配備手順](infra/cloudflare/README.md)を現在の正本とする。
- AI生成は設計まで。コードは論理単位でコミット済み。Web WorkerとDBは未配備。既存データ移行・AWS停止は実施しない。
- 追加依頼の配備先は`yumaboda.official@gmail.com`（`1c93af48e1a5c2e163edc9030cff4647`）。通常会員向けの新環境・既存データ移行なし。非公開R2 `oshinest-files`とARキャッシュの7日ライフサイクルを作成済み。Cloudflare追加認証は完了し、非公開のGeometry Worker・Containerを配備済み。実際のCloudflare Containerへの一致テスト5件が成功。Neon認証は期限切れ、Resend/Twilio設定は未提供。[配備の進捗](infra/cloudflare/README.md#今回の配備先と進捗2026-09-28)を参照。
- 型・lint・250件のVitest・117件のSQL・本番ビルドでの10件のブラウザ試験・Wrangler dry runを確認。[検証範囲](infra/cloudflare/README.md#検証範囲)を参照。
- このWSLではContainersのネイティブなローカル起動が停止するため、手順書のDocker代替経路を使用。`/dev/ar`のホストフォルダ読み取りもWorkersでは利用できず、CLI解析またはARファイル投稿で確認する。
- GitHub同期前のREADME変更は既存のstash、未pushコミットは`refactoring`に残す。この変更では適用しない。

以下は移行前の経緯。AWSやNext.jsの起動・配備に関する記述は上記を優先する。

---

# 開発の再開

現在の構成とセットアップは [README](README.md)、AWS配備は [infra/aws/README.md](infra/aws/README.md)、改善対象は [docs/architecture.md](docs/architecture.md) を参照する。作業開始時に `git status` を確認し、既存の未コミット変更を保持する。

- Node.js 24。`npm run dev:services` → `npm run db:migrate` → `npm run dev` で再開する。
- DBはPostgreSQL、認証はBetter Auth、保存はS3。業務SQLとRLSは `db/migrations/`。
- `db:seed` は初回の空DB専用。既存データをリセットしない。
- デモ注文を維持する。実課金・送金を有効化しない。
- AWSゲスト環境はメール・SMSを無効化。通常認証のローカル環境はMailpitを使う。
- 認可は各Server Action / ページで確認し、ユーザーIDはDBセッションから得る。アプリのDB接続に管理ユーザーを使わない。
- Next.jsのAPIを変更するときは `node_modules/next/dist/docs/` を読む。
- AWSアカウントの変更は、対象リソース・アカウント・リージョン・範囲を確認してから行う。

古い実装メモは `docs/archive/` に保管している。現行の起動手順や実装状況として使用しない。
