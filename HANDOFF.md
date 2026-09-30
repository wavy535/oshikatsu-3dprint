# 開発の入口

現行仕様・開発手順は [README](README.md)、目的別の資料は [ドキュメント一覧](docs/README.md) を参照する。作業履歴はGitに残し、このファイルへ日誌を追記しない。

- 作業前に `git status` と [AGENTS.md](AGENTS.md) を確認し、既存の変更を保持する。
- 現行構成はWorkers / D1 / R2 / Containers。旧AWS・PostgreSQL資料を通常の起動手順に使わない。
- 注文はデモ。実課金を有効にしない。印刷原本を公開せず、注文が参照するファイルを削除しない。各操作で利用者の権限を確認する。
- 開発DBのseedは空DB専用。既存データや適用済みマイグレーションを上書きしない。
- 本番で使える機能は配信中の版を確認する。配備手順は [Cloudflare](infra/cloudflare/README.md)、検証範囲は [テスト方針](docs/testing.md) を参照する。
