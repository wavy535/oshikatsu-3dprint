# Cloudflareへの配備

## 配備先と設定

配備先は [wrangler.jsonc](../../wrangler.jsonc) と [Geometry設定](geometry/wrangler.jsonc) で指定する。対象アカウントは `yumaboda.official@gmail.com` / `1c93af48e1a5c2e163edc9030cff4647`、公開URLは https://oshinest.yumaboda-official.workers.dev 。

| リソース | 名前・設定 |
| --- | --- |
| Web Worker | `oshinest` |
| D1 | `oshinest` / `f0c7b9d1-1af4-4553-a2ef-bb42e65036ca` |
| R2 | 非公開 `oshinest-files`、`ar-cache/` は7日で削除 |
| Geometry | 非公開 `oshinest-geometry` / Containers |
| 配置 | D1 primaryのSIN近傍へのヒント `aws:ap-southeast-1`。AWSリソースは不要 |

これらは既存の配備先。再配備のためにDB・バケットを再作成しない。現在配信中のバージョン、リモートの適用済みマイグレーション、secretの有無は配備時に確認する。

PostgreSQL・Hyperdrive・Neonの新規作成、旧AWSの停止・削除は通常の配備に含めない。既存データの移行と開発fixtureの本番投入も行わない。

公開条件は **メール未確認でも一般会員登録を許可し、クリエイター申請は停止する**。`email_verified` を偽装しない。メール・SMSを送らず、メールによるパスワード再設定も提供しない。実決済・送金は未実装。初期DBに開発用会員・作品・管理者を投入しない。

## ローカル

Node.js 24とDockerを使用する。既存の設定ファイルは上書きしない。

```bash
npm ci
cp .dev.vars.example .dev.vars
# .dev.vars の AUTH_SECRET に openssl rand -hex 32 の生成値を設定
npm run cf:types
npm run db:migrate
npm run db:seed # 空のローカルD1だけ。remoteへ書き込む機能はない
npm run dev:services
```

次の2プロセスを別ターミナルで起動する。

```bash
npm run dev:geometry:local
npm run dev
```

アプリは http://localhost:3000 。D1・R2のローカル状態は `.wrangler/state/v3`。PostgreSQL・Mailpitは通常の開発で不要。ローカル会員は `buyer@example.com` / `creator@example.com` / `creator2@example.com` / `admin@example.com`、パスワードは `password123`。公開先へseedしない。

Containersのネイティブなローカル起動が使えない環境では、同じDockerイメージをComposeで起動し、ローカルservice bindingから転送する。`infra/local/geometry` は配備しない。終了時はdevプロセスを終了し `docker compose stop geometry`。データのボリュームは削除しない。通常のContainers開発環境では `npm run dev:geometry` を利用できる。

Viteは `dist/server/.dev.vars` にローカルsecretをコピーする。`dist` 全体を共有・公開しない。配備はWranglerから行い、公開assetsは `dist/client` だけにする。

本番は必ず `npm run build` を使う。Viteの後に必要CSSの抽出プランをWorkerへ組み込む工程がある。`src/worker.ts` は成功した小さいHTMLだけを最適化し、API・RSC・ファイル配信はそのままvinextへ委ねる。詳細は[性能設計](../../docs/performance.md)。

## D1を用意する

上記のDBは作成済み。以下は別環境を新設する場合の手順であり、同じDBを再作成しない。

```bash
npx wrangler login --device --browser=false --scopes user:read account:read workers:write workers_scripts:write workers_tail:read d1:write containers:write cloudchamber:write artifacts:write
npx wrangler whoami
npx wrangler d1 create oshinest --location apac
```

対象アカウントを確認し、返されたUUIDを `wrangler.jsonc` の `DATABASE.database_id` に設定する。`npm run db:migrate:remote` で `db/d1/` を適用する。新規DBにはマスター情報だけが入り、会員・注文・作品は作られない。

D1の設計、旧PostgreSQLとの差、検証方法は [D1の設計](../../docs/d1-migration.md) を参照。既存の `db/migrations/` と `db/tests/` は比較資料であり、D1には実行しない。

管理者権限を未確認のメールアドレスだけで自動付与しない。初期管理者が必要になった際は、運営本人の登録済みユーザーIDを確認した上で、管理用のD1経路から別途設定する。

## R2・解析サービス

R2は非公開で、元データに公開URLを設定しない。配備済みバケットとGeometryをそのまま利用する。

```bash
# 新しい別環境を作る場合だけ実行する
npx wrangler r2 bucket create oshinest-files
npx wrangler r2 bucket lifecycle add oshinest-files ar-cache-expiry ar-cache/ --expire-days 7
npm run deploy:geometry
```

`oshinest-geometry` はservice binding専用で、workers.devとpreview URLは無効。最大2インスタンス、standard-1、各1処理、外向き通信なし。混雑時は503から再試行メッセージへ変換する。待ち行列は未実装。

ContainerはSIGTERMで処理を終了できることを確認する。イメージのバージョンやrollout結果は配備記録で管理し、手順書の固定値として使わない。

## Webを配備する

`AUTH_SECRET` は32文字以上の乱数。対話入力または標準入力からsecret登録し、Git・チャット・ログへ記録しない。メール/SMSのキーは不要。既存の `AUTH_SECRET` は再配備のたびに変更しない。AIを有効にする場合は `OPENAI_API_KEY` とD1の `0009_ai_design_usage.sql` を含む未適用マイグレーションが必要。

```bash
npm run db:migrate:remote
# 初回作成または明示的なローテーション時だけ
npx wrangler secret put AUTH_SECRET
# AIを有効にする場合（値は対話入力）
npx wrangler secret put OPENAI_API_KEY
npm run cf:types
npm run typecheck
npm run lint
npm test
npm run build
npx wrangler deploy --config dist/server/wrangler.json --dry-run
npm run deploy
```

`deploy` は仮のD1 IDとSITE_URL、および設定した公開条件との不一致を拒否する。secretの有無とリモートDBへのマイグレーション適用は別途確認する。初回配備はWranglerの `--secrets-file` でコードとsecretを同時に登録できる。ファイルは0600の一時ファイルとし、成功・失敗にかかわらず削除する。

## 配備前後の検証

ローカルWebとGeometryを起動し、外部サービス依存の試験も実行する。通常の `npm test` ではR2・Geometryの7ケースはskipされる。

```bash
TEST_WORKER=true TEST_GEOMETRY=true npm test
npm run test:e2e
npm run check:compat
```

全E2Eを公開URLへ向けない。開発用会員を使いDB・R2を書き換える試験を含む。実行方法と試験データの問題は [テスト文書](../../docs/testing.md) を参照。

配備後はhealth・公開ページ、一般会員登録とセッション維持、申請停止、未認証の保護画面、privateファイル・不正転送トークンの拒否を確認する。AIを配備した場合はモデル設定・利用枠・API接続も確認し、有料確認には予算を設ける。確認用データは作成したものだけを特定して片付ける。

実機AR、最大入力時のメモリ、負荷・料金は別の検証。`/dev/ar` のホストフォルダ読み取りはWorkersでは利用できないため、CLI解析または作品のARファイル投稿を使う。性能の比較条件は [性能設計](../../docs/performance.md) を参照。

## 一次資料

- [D1 batchとWorker API](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- [D1の制約](https://developers.cloudflare.com/d1/platform/limits/)
- [vinext on Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)
- [R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)
- [Containersの設定](https://developers.cloudflare.com/containers/get-started/)
