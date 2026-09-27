# Cloudflareへの配備

Webはvinext/ViteをCloudflare Workersで実行する。ファイルはR2、重い3D処理はContainersへ保存・分離し、AWS外のPostgreSQLへHyperdriveで接続する。メールはResend、SMSはTwilio。AWSの認証情報・SDK・S3署名は実行時に使わない。

AI編集機能の追加設計と構成選定は[制作基盤の設計](../../docs/product-architecture.md)。Cloudflare上のリソース作成、既存データ移行、DNS切り替えは、リポジトリのビルドだけでは実行されない。

## 今回の配備先と進捗（2026-09-27）

- 配備先：`yumaboda.official@gmail.com`のCloudflareアカウント（`1c93af48e1a5c2e163edc9030cff4647`）。両Workerの設定に固定済み。
- 通常会員向けの新環境。`DEMO_GUEST_ENABLED=false`を維持し、既存DB・S3のデータ移行や開発用seedは行わない。
- 公開予定URL：`https://oshinest.yumaboda-official.workers.dev`。Worker本体は未配備で、このURLは公開済みの成果ではない。
- `oshinest-files`をAPACの配置ヒントで新規作成。`r2.dev`公開は無効。`ar-cache/`だけに7日で期限切れとなるルール`ar-cache-expiry`を設定済み。
- PostgreSQLは新規作成が必要。NeonのCLIを準備したがブラウザ認証が時間切れとなり、DBは未作成。Hyperdrive IDも未設定。
- Cloudflareの既存認証には`containers:write`が不足。追加スコープの認証は時間切れとなり、Geometry Worker・Containerは未配備。
- Resendの送信元・APIキー、Twilioの接続情報は未設定。通常会員向けの公開前に設定する。
- アカウントと公開予定URLを設定した状態でビルドとWrangler dry runは成功。実配備の完了を意味しない。

再開時は同じ開発環境でCloudflareとNeonへ認証する。以前発行した一時URL・デバイスコードは期限切れのため再利用しない。

```bash
npx wrangler login --device --browser=false --scopes user:read account:read workers:write workers_scripts:write workers_tail:read containers:write cloudchamber:write artifacts:write
npx wrangler whoami
npx --yes neonctl@6.2.3 auth
```

Neon側の対象アカウント・プランを確認してから新しいDBを作成し、以下の手順でスキーマ、Hyperdrive、secretを準備する。認証情報はGitやチャットに記録しない。既に作成したR2バケットを再作成せず、Workerの配備が完了した時点でこの進捗を更新する。

## ローカル

Node.js 24とDockerを用意する。初回のみ環境ファイルをコピーする。既存の設定ファイルは上書きしない。

```bash
npm ci
cp .env.local.example .env.local
cp .dev.vars.example .dev.vars
# .dev.vars の AUTH_SECRET に openssl rand -hex 32 の生成値を設定
npm run cf:types
npm run dev:services
npm run db:migrate
npm run db:seed # 初回の空DBだけ
```

`.env.local`はDB管理ツール用、`.dev.vars`はWorker用。管理者の`MIGRATION_DATABASE_URL`をWorkerへ渡さない。`.dev.vars`があるとWranglerはそちらを使用する。型ファイルは設定から生成し、手書きしない。

Viteプラグインはプレビュー用に`dist/server/.dev.vars`を生成する。これはローカルsecretを含むため、`dist`全体を公開・共有しない。配備はWranglerから行い、公開assetsは`dist/client`だけにする。

次の2プロセスを別ターミナルで起動する。Geometry WorkerはローカルのDockerイメージをビルドする。

```bash
npm run dev:geometry
npm run dev
```

WSLでコンテナのproxyだけが起動して処理が止まる場合は、[上流の既知報告](https://github.com/cloudflare/containers/issues/231)と同じ症状か確認する。この環境では次の代替経路を使う。通常の`dev:geometry`は停止してから起動する。

```bash
docker compose --profile geometry up -d --build geometry
npm run dev:geometry:local
```

これは同じコンテナイメージをDockerで直接起動し、ローカルのservice bindingから転送する経路。本番のコンテナ起動制御を検証したことにはならない。`infra/local/geometry`は配備しない。終了時は`docker compose --profile geometry stop geometry`で止める。

アプリは http://localhost:3000 、Mailpitは http://localhost:58025 。DBは127.0.0.1:55432。ローカルR2は`.wrangler/state`に保存する。既存DBを使う場合、画像だけの準備は`npm run db:seed:storage`。MinIOは不要で、以前のDockerボリュームは削除しない。

開発用会員は `buyer@example.com` / `creator@example.com` / `creator2@example.com` / `admin@example.com`、パスワードは`password123`。これはローカルのfixtureで、公開先へseedしない。

## 配備前に設定するもの

| 設定 | 内容 |
| --- | --- |
| Cloudflare account | 配備先を`CLOUDFLARE_ACCOUNT_ID`等で明示し、`wrangler whoami`で確認 |
| PostgreSQL | AWS外のDB。既存のロール作成、関数、RLS、拡張をサポートする管理先 |
| Hyperdrive | `app_runtime`として接続、TLS verify-full、**query cachingを無効** |
| R2 | 非公開の`oshinest-files`。公開バケット設定を使わない |
| SITE_URL | `wrangler.jsonc`内の実際のHTTPS公開origin |
| AUTH_SECRET | 32文字以上のランダムなsecret。必要に応じて旧セッションとの互換を考慮 |
| メール | `MAIL_PROVIDER=resend`、検証済み`MAIL_FROM`、`RESEND_API_KEY` |
| SMS | `SMS_PROVIDER=twilio`、Account SID、API key SID/secret、Messaging Service SID |

通常環境の認証にはメールとSMSが必要。ゲスト専用の隔離デモだけは`DEMO_GUEST_ENABLED=true`とし、両providerを`none`にできる。通常会員DBをゲスト用DBとして流用しない。

vinextとContainersはベータ版。Workers/Containers/Hyperdriveと外部DB・配信サービスの利用条件・費用を配備先で確認する。まだ費用・起動時間・最大入力時のメモリを測定していない。

## PostgreSQLを移す

空環境なら`db/bootstrap.sql`と既存のマイグレーションを管理者接続で実行し、`app_runtime`のLOGINパスワードをDB管理経路で設定する。管理ツールは`DATABASE_SSL_MODE=verify-full`で公開CAを検証し、独自CAなら`DATABASE_SSL_CA`を指定する。WorkerはHyperdriveが返す接続文字列だけを使う。

既存データを移す場合は、AWS側を勝手に空にしたりseedで置き換えたりしない。管理者経路で取得したPostgreSQLのバックアップを移行先へ復元し、ロール・所有者・GRANT・マイグレーションのチェックサムを確認する。切り替え時には書き込みを止めるか差分同期を用い、会員・注文・在庫・払出し・通知の件数と状態を比較する。

DBやS3のdumpには個人情報が含まれるため、リポジトリには置かない。移行先は通常環境とゲスト環境で別DB・別bucketにする。

Hyperdriveは例として次の設定で作成できる。接続URLはローカルのsecret管理から渡し、端末出力やシェル履歴へ値を記録しない。

```bash
npx wrangler hyperdrive create oshinest-db --connection-string "$OSHINEST_DATABASE_URL" --caching-disabled --sslmode verify-full
```

返されたIDを`wrangler.jsonc`の`DATABASE.id`へ設定する。アプリはSQLごと／明示トランザクションごとに`SET LOCAL`で権限を限定する。Hyperdriveのキャッシュを有効にしてよいという意味ではない。

## R2と解析サービス

```bash
npx wrangler r2 bucket create oshinest-files
npx wrangler r2 bucket lifecycle add oshinest-files ar-cache-expiry ar-cache/ --expire-days 7
```

元S3のオブジェクトを移すときは、`work-stl/`・`work-ar/`・`work-images/`・`qc-photos/`・`avatars/`のキーとContent-Typeを維持する。件数・サイズ・ハッシュを比較する。`ar-cache/`は再生成可能。注文のスナップショットが参照する旧印刷ファイルも移し、原本へ7日削除ルールを付けない。

`oshinest-geometry`はservice binding専用で、公開URLは無効。コンテナへ渡すのは認可済みファイルのストリームと造形条件。DB認証情報・R2管理キー・任意URL・任意コードを渡さない。最大2インスタンス、1インスタンス1処理。待ち行列は未実装で、混雑時は503から再試行メッセージへ変換する。

```bash
npm run deploy:geometry
```

このコマンドはコンテナを**実際に配備**する。Cloudflareの対象アカウントと利用プランが確定してから実行する。

## Webを配備

secretは対話入力で登録する。SMS用APIキーとメール用APIキーをチャットやGitへ貼らない。

```bash
npx wrangler secret put AUTH_SECRET
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put TWILIO_ACCOUNT_SID
npx wrangler secret put TWILIO_API_KEY_SID
npx wrangler secret put TWILIO_API_KEY_SECRET
npx wrangler secret put TWILIO_MESSAGING_SERVICE_SID
npm run cf:types
npm run typecheck
npm run lint
TEST_DATABASE=true npm test
npm run test:db
npm run build
npx wrangler deploy --config dist/server/wrangler.json --dry-run
npm run deploy
```

`deploy`は未設定のHyperdrive ID、仮のSITE_URL、通常環境の未設定providerを拒否する。secretの存在や移行データの整合性まで保証するものではない。stagingとproductionはリソース名・binding・secretを分離する。

配備後、ログイン→作品表示→投稿・解析→AR→デモ注文→運営確認を実行し、他人の非公開ファイルにアクセスできないことを確認する。実課金や送金機能が有効になったとは扱わない。検証を通してからDNS／利用者の導線を切り替え、AWSの停止・削除は別の操作として扱う。

## 検証範囲

2026-09-27、Node.js 24 / ローカルworkerd / Docker PostgreSQL・Geometryで確認した結果：

| 検証 | 結果 |
| --- | --- |
| 型・lint・vinext互換性チェック | エラーなし。互換性チェックの対象15項目はすべて対応 |
| Vitest（DB・R2・Geometry結合テストを有効化） | 40ファイル、250件成功 |
| SQLの境界・権限・業務テスト | 117件成功 |
| 開発時ブラウザ | 11件成功、隔離ゲスト用2件は対象外 |
| 本番ビルドのローカルブラウザ | 10件成功。MailpitによるSMSは本番モードで無効なので、メール／SMS確認は開発時に実施 |
| ビルド・Wrangler dry run | 成功。実配備ではない |
| npm依存監査 | 0件（fflate修正版のoverride適用後） |

Geometryは前述のWSL向けDocker経路を使用。本番相当ビルドで、投稿・公開・GLB/USDZ変換・R2キャッシュ・デモ注文・スマートフォン幅の操作を確認した。未設定のHyperdrive IDを配備前チェックが拒否することも確認した。

ローカルでの型・lint・SQL・Nodeテスト・ブラウザテストと、本番のHyperdriveや実機ARは別の検証。スマートフォンのAR寸法誤差、最大80MiB入力、同時利用、通知配信の実送信、運用料金は本番相当環境で測る。現在の肉厚等の検査は造形成功を保証しない。

追加の結合テストは、ローカルのWeb WorkerとGeometry Workerを起動して実行する。

```bash
TEST_DATABASE=true TEST_WORKER=true TEST_GEOMETRY=true npm test
```

R2の署名・サイズ制約・Rangeレスポンスと、Containerに分離したSTL/3MF解析・GLB/USDZ変換が従来の処理と一致することを検証する。`/dev/ar`のホスト上のフォルダ読み取りはWorkersの仮想ファイルシステムから利用できない。ローカルのファイル検証は`npm run analyze -- <path>`、AR確認は作品のARファイル投稿を使う。

vinextの間接依存であるfflate 0.7.3には[ZIP64解析の停止不能の修正](https://github.com/advisories/GHSA-px8p-9vwx-vf98)があるため、同じ0.7系列の0.7.5へoverrideしている。上流で修正版に移行したらoverrideを取り除く。

## 一次資料

- [vinext on Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)
- [HyperdriveとPostgreSQL](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/)
- [R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)
- [Containersの設定](https://developers.cloudflare.com/containers/get-started/)
- [Resend API](https://resend.com/docs/api-reference/emails/send-email)
- [Twilio Messaging API](https://www.twilio.com/docs/messaging/api/message-resource)
