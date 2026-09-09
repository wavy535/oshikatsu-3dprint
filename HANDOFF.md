# 開発の再開

現在の構成とセットアップは [README](README.md)、AWS配備は [infra/aws/README.md](infra/aws/README.md)、改善対象は [docs/architecture.md](docs/architecture.md) を参照する。作業ブランチは `refactoring`。変更は論理的に分けてコミットする。

- Node.js 24。`npm run dev:services` → `npm run db:migrate` → `npm run dev` で再開する。
- DBはPostgreSQL、認証はBetter Auth、保存はS3。業務SQLとRLSは `db/migrations/`。
- `db:seed` は初回の空DB専用。既存データをリセットしない。
- デモ注文を維持する。実課金・送金を有効化しない。
- アプリ内通知とメール配信を維持する。認証メールと通知メールは共通のSES/Mailpit経路。
- 認可は各Server Action / ページで確認し、ユーザーIDはDBセッションから得る。アプリのDB接続に管理ユーザーを使わない。
- Next.jsのAPIを変更するときは `node_modules/next/dist/docs/` を読む。
- AWSアカウントの変更は、対象リソース・アカウント・リージョン・範囲を確認してから行う。

古い実装メモは `docs/archive/` に保管している。現行の起動手順や実装状況として使用しない。
