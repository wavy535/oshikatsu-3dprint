# 開発の入口

現行仕様・開発手順は [README](README.md)、目的別の資料は [ドキュメント一覧](docs/README.md) を参照する。作業履歴はGitに残し、このファイルへ日誌を追記しない。

- 作業前に `git status` と [AGENTS.md](AGENTS.md) を確認し、既存の変更を保持する。
- 現行構成はWorkers / D1 / R2 / Containers。旧AWS・PostgreSQL資料を通常の起動手順に使わない。
- デモ注文、非公開の原本、注文時のファイル保持、利用者別の認可を維持する。
- 開発DBのseedは空DB専用。既存データや適用済みマイグレーションを上書きしない。
- コードの実装状態と本番の配備状態を区別する。配備先・操作は [Cloudflare](infra/cloudflare/README.md)、検証範囲は [テスト方針](docs/testing.md) を参照する。
