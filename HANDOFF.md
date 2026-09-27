# 2026-09-27: Cloudflare向け構成への変更

- 実行系はvinext/Vite + Workers。`next/*` APIは互換実装、Next.jsは型・lint用の開発依存。
- 非公開R2、Hyperdrive + AWS外のPostgreSQL、ContainersのGeometry Workerへ分離。
- `npm run cf:types`で型を生成。ローカルは`.dev.vars`を必ず用意し、管理用`.env.local`と分離する。
- `npm run dev:geometry`と`npm run dev`を別プロセスで起動。DBは既存のDocker Compose。
- [構成選定・AI制作の設計](docs/product-architecture.md)、[配備手順](infra/cloudflare/README.md)を現在の正本とする。
- 今回はコードと設計。AI生成の実装、Cloudflareの実配備、既存データ移行、AWS停止は未実施。
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
