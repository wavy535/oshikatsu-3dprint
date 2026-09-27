# OshiNest（オシネスト）

推しぬいのおうち・家具・小物を、つくり、公開し、3Dプリントで届けるサービスです。CAD未経験者がスマートフォンから制作できる環境を目指します。

現在動くのは作品投稿・マーケット・AR・デモ注文・製造管理です。**AIモデリングは構成設計の段階、決済・送金はデモ**です。Cloudflareの通常会員向け新環境へ配備を進めています。[配備済みリソースと未設定項目](infra/cloudflare/README.md#今回の配備先と進捗2026-09-27)を参照してください。既存AWSの停止は実行していません。

## 構成

| 役割 | 技術 |
| --- | --- |
| Web | React / TypeScript / Tailwind、vinext / Vite → Cloudflare Workers |
| 認証 | Better Auth、DBセッション |
| DB | Cloudflare D1 / Kysely（SQLite） |
| ファイル | 非公開R2、期限・操作・サイズを限定した署名URL |
| 3D解析・AR変換 | Cloudflare Containers、service binding経由 |
| メール・SMS | 今回の公開では送信しない。一般会員登録はメール未確認を許可 |

Next.jsのWebサーバーを運用から外し、既存の`next/*` APIはvinextの互換実装で処理します。Next.jsパッケージは型・lintの開発依存として残しています。vinextとContainersはベータ版で、従来構成との速度・費用比較は未実施です。

DBはD1へ移植しました。利用者別の可視性、同時注文、在庫、精算額を検証しています。[D1への移行と差異](docs/d1-migration.md)を参照してください。[構成選定とAI制作機能の設計](docs/product-architecture.md)に理由と次の実装範囲を記載しています。

## 現在の機能

| 利用者 | 機能 |
| --- | --- |
| 購入者 | 検索、マイぬい・寸法確認、お気に入り、AR、デモ注文、評価、相談・メッセージ |
| クリエイター | 複数3MF/STLの投稿・検証、印刷指示、画像・ARモデル登録、サイズ別価格・在庫、公開、見積り・修正対応 |
| 運営 | 申請審査、印刷・検品・発送状態、材料在庫、実費・払出し記録、通知メールの手動配信 |

投稿は「データ検証 → 印刷指示 → 作品情報・サイズ設定 → 公開」。1作品16ファイル、一度の送信は合計80MiBまで。原本・注文時のファイル・AR表示用モデルは区別して保管します。

AR用モデルはSTL・3MF・Blenderに対応し、基準15cm用の寸法を使います（STL/3MFはmm、Blenderは1単位100mm）。肉厚・自己交差の検査は近似であり、自動検査が印刷成功を保証するものではありません。

## ローカル開発

Node.js 24とDockerを使用します。設定ファイルが既にある場合は上書きしないでください。

```bash
npm ci
cp .dev.vars.example .dev.vars
# .dev.vars の AUTH_SECRET に openssl rand -hex 32 の生成値を設定
npm run cf:types
npm run dev:services
npm run db:migrate
npm run db:seed # 初回の空DBのみ。既存DBには実行しない
```

別々のターミナルで起動します。

```bash
npm run dev:geometry:local
npm run dev
```

WSLでContainersのローカル起動が止まる場合は、[ローカル用の代替手順](infra/cloudflare/README.md#ローカル)を使用します。

アプリ: http://localhost:3000 。ローカルD1・R2は`.wrangler/state`。既存DBの画像だけを準備する場合は`npm run db:seed:storage`を使います。

開発会員は `buyer@example.com` / `creator@example.com` / `creator2@example.com` / `admin@example.com`、共通パスワードは`password123`です。公開環境へ開発会員をseedしません。公開環境ではクリエイター申請を停止しています。

`.dev.vars`はWorker用です。PostgreSQLは移行比較用の開発ツールにだけ残り、通常の開発・本番では起動しません。停止時はdevプロセスを終了し、`docker compose stop`。DBとローカルR2の内容は残ります。

## 検証・配備

```bash
npm run cf:types
npm run check:compat
npm run typecheck
npm run lint
npm test
npm run test:db
npm run build
# ローカルのアプリ・解析サービスを起動した状態で
npm run test:e2e
```

D1・R2・Containers・secret・dry runは[Cloudflare配備手順](infra/cloudflare/README.md)を参照。`npm run deploy`は仮設定を検出して止まります。既存AWSの停止・削除は含みません。

## 資料

- [制作機能・AI・造形検証の設計](docs/product-architecture.md)
- [現在の業務機能と制約](docs/architecture.md)
- [Cloudflare配備手順](infra/cloudflare/README.md)
- [画面デザイン資料](docs/design.md)
- [開発引継ぎ](HANDOFF.md)
- [旧AWS構成の記録](infra/aws/README.md)
