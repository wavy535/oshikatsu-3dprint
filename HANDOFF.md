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
