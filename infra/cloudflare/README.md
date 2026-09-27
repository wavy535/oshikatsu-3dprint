# Cloudflareへの配備

## 今回の配備先と進捗（2026-09-28）

2026-09-28更新。対象は `yumaboda.official@gmail.com` のアカウント `1c93af48e1a5c2e163edc9030cff4647`。通常会員向けの新環境を作り、既存データは移行しない。公開URLは https://oshinest.yumaboda-official.workers.dev 。

- 非公開R2 `oshinest-files` を作成済み。`ar-cache/` は7日で削除する。
- 非公開Geometry Worker・Containersは配備済み。バージョン `23555a3f-7f25-4669-be8c-bc013477c4af`、application ID `a03c3435-2afe-4a00-b33f-9431f949aa28`。
- D1 `oshinest`（`f0c7b9d1-1af4-4553-a2ef-bb42e65036ca`）をAPACに作成済み。`0001`〜`0008`を適用し、外部キーの整合性と会員・作品・注文が空の状態を確認した。
- Web Worker `oshinest` を配備済み。バージョン `88e558ee-1a94-4d7e-8399-f0f7291bdd3a`、deployment `6fd3b5c5-ddb3-44d3-8d03-5dbb063f39d6`、100%配信。`AUTH_SECRET` は登録済みで、再配備時には変更していない。
- PostgreSQL・Hyperdrive・Neonの新規作成は行わない。AWSの停止・削除も行わない。

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

このWSLではContainersのネイティブなローカル起動が止まったため、同じDockerイメージをComposeで起動し、ローカルservice bindingから転送する。`infra/local/geometry` は配備しない。終了時はdevプロセスを終了し `docker compose stop geometry`。データのボリュームは削除しない。通常のContainers開発環境では `npm run dev:geometry` を利用できる。

Viteは `dist/server/.dev.vars` にローカルsecretをコピーする。`dist` 全体を共有・公開しない。配備はWranglerから行い、公開assetsは `dist/client` だけにする。

## D1を用意する

今回のDBは作成済み。以下は別環境を新設する場合の手順であり、同じDBを再作成しない。

```bash
npx wrangler login --device --browser=false --scopes user:read account:read workers:write workers_scripts:write workers_tail:read d1:write containers:write cloudchamber:write artifacts:write
npx wrangler whoami
npx wrangler d1 create oshinest --location apac
```

対象アカウントを確認し、返されたUUIDを `wrangler.jsonc` の `DATABASE.database_id` に設定する。`npm run db:migrate:remote` で `db/d1/` を適用する。新規DBにはマスター情報だけが入り、会員・注文・作品は作られない。作成済みのDBを再作成しない。

D1の設計、旧PostgreSQLとの差、検証方法は [移行記録](../../docs/d1-migration.md) を参照。既存の `db/migrations/` と `db/tests/` は比較資料であり、D1には実行しない。

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

配備済みイメージは `sha256:bb7a388aefa51f6a33351cfcefe59a0452b97697e6b9c4404c1e69de92121f64`。初回送信では通常の一時認証期限15分を超えたため、公式の `containers registries credentials` で60分の一時認証を取得して同じイメージを再送した。認証情報は専用一時ディレクトリにだけ保存し、送信後に削除した。

NodeがPID 1の場合のSIGTERM終了処理を実装済み。通常停止と処理中の停止をローカルDockerで検証し、exit 0を確認。修正版のCloudflare rollout後、両インスタンスのinactive状態と一致テスト5件の成功を確認済み。

## Webを配備する

`AUTH_SECRET` は32文字以上の乱数。対話入力または標準入力からsecret登録し、Git・チャット・ログへ記録しない。メール/SMSのキーは不要。

```bash
npm run db:migrate:remote
npx wrangler secret put AUTH_SECRET
npm run cf:types
npm run typecheck
npm run lint
npm test
npm run build
npx wrangler deploy --config dist/server/wrangler.json --dry-run
npm run deploy
```

`deploy` は仮のD1 IDとSITE_URL、および今回と異なる公開条件を拒否する。secretの存在やリモートDBの初期化までは保証しない。配備後に公開ページ、一般会員登録・セッション維持、申請停止、privateファイル拒否を確認する。初回配備はWranglerの `--secrets-file` でコードとsecretを同時に登録できる。ファイルは0600の一時ファイルとし、成功・失敗にかかわらず削除する。

## 検証範囲

移行前はPostgreSQLの境界テスト117件を比較基準として確認済み。D1移行後は料金計算72ケースと注文スナップショットを旧DBから取得し、期待値として固定した。D1版では権限、在庫競合、精算の丸め、ぬい寸法、通知、失敗時の全体巻き戻し、アップロード差し替え、一覧・集計を検査する。旧SQLテスト117件がそのままD1上で動いたという意味ではない。

```bash
# WebとローカルGeometryを起動して実行
TEST_WORKER=true TEST_GEOMETRY=true npm test
npm run test:e2e
npm run check:compat
```

D1のマイグレーション・認証情報分離・rollbackは実際のworkerdでも実行する。ブラウザは登録、注文、非公開データの拒否、複数STL/3MF投稿、GLB/USDZ変換、R2保存、スマホ幅での操作を確認する。隔離ゲスト環境の2件は今回対象外。

D1初回公開時に型・lint・Vitest 258件・互換性15項目・ビルド・Wrangler dry runが成功。本番ビルドのローカルブラウザ試験11件が成功し、隔離ゲスト用2件は対象外。npm監査は0件。リモートD1への適用時にCASE式とトリガーのENDを誤認する分割エラーが発生したため、生成時にCASE式を括弧で囲む修正を追加した。D1関連43件を再実行し、新規のSQL互換性テスト2件、型・lintも成功。

公開先ではhealth・トップ・登録画面が200、未ログインの会員/制作/管理画面がログインへ誘導され、privateファイルは404、不正な転送トークンは403となることを確認した。実ブラウザでは、一般会員登録、未確認フラグ維持、再読込後のセッション、申請停止、制作/管理の拒否、メール/SMS/パスワード再設定/匿名登録の停止、320px幅、パスワード再ログイン、実行時例外なしの9項目が成功。最初の試験では検索・ログアウト用フォームまで申請フォームとして数えたため検証側の条件を修正し、全項目を再実行した。2回分の確認用会員はそれぞれ完全一致のメールアドレスで削除し、リクエスト権限をguestへ戻した。R2の公開URL無効も再確認済み。

実機ARの寸法誤差、80MiB最大入力時のメモリ、負荷・料金の測定は未実施。肉厚等の検査は近似であり、造形成功を保証しない。`/dev/ar` のホストフォルダ読み取りはWorkersでは利用できず、CLI解析または作品のARファイル投稿を使う。

会員ページのLCP改善後は273件のVitest、本番ビルドのブラウザ15件、公開先のUI試験3件を確認済み（隔離ゲスト2件対象外）。変更理由は [UI再設計](../../docs/ui-redesign.md)、計測結果は [匿名ページ](../../docs/performance-2026-09-28.md)・[会員の通知設定](../../docs/performance-member-2026-09-28.md) を参照。通知設定のスマホLCP中央値は7140→2484ms（同じ会員・通信条件、3回）。DBスキーマ・secretは未変更。公開計測用の会員1件は作成後に削除し、関連セッション等の残数ゼロを確認した。

## 一次資料

- [D1 batchとWorker API](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- [D1の制約](https://developers.cloudflare.com/d1/platform/limits/)
- [vinext on Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)
- [R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)
- [Containersの設定](https://developers.cloudflare.com/containers/get-started/)
