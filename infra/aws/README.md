# AWSで動かす構成

2026-09-09。Next.jsをAWSのNode.jsコンテナで動かし、Auth・PostgreSQL・Storageは当面Supabaseを継続する。実決済は提供せず、アプリ内通知と通知メールは維持する。

## 配備するもの

| 役割 | 配備先・構成 |
| --- | --- |
| Web / Server Actions / 3D解析 | ECS Express ModeのFargateコンテナ。Node.js 24、Next.js standalone |
| TLS・HTTP入口 | Express Modeが管理するALB |
| 認証・DB・画像・3Dファイル | Supabase。RLS・業務RPC・DBトリガーを継続 |
| アプリ内通知 | 既存のnotificationsテーブル。専用サービスは追加しない |
| 通知メール | 同じWebコンテナからSES API。認証はECSタスクロール |
| 定期実行 | Supabase pg_cron。見積り期限切れはSQL、メールはpg_netでWebのcron入口を呼ぶ |

[Amplify公式の対応表](https://docs.aws.amazon.com/amplify/latest/userguide/ssr-amplify-support.html)にはNext.js 15までとあるため、16.3.4をそのまま配備できる前提を外した。Dockerは通常のNode.jsサーバーとして動かし、ホスティング固有のNext.jsアダプターを追加しない。

[ECS Express Mode](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/express-service-overview.html)はALB・HTTPS・Fargateサービスなどを管理する。設定例はデモ用に1タスク固定、1 vCPU / 2 GiB。停止中もFargateの稼働分・ALBなどの料金があるため、アプリ全体の固定費は別途見積もる。通知のための常駐タスクは増やさない。

メールの主な追加費用は送信通数で、標準の従量料金は1,000通あたり0.10 USD、ほかにデータ転送等がある。[SES料金](https://aws.amazon.com/jp/ses/pricing/)。DB保存量・アプリ処理・ログも増えるので、追加費用が厳密にゼロという意味ではない。

## イメージの作成

```bash
# 公開値だけをビルドへ渡す。値は対象Supabaseプロジェクトのものにする。
export NEXT_PUBLIC_SUPABASE_URL='https://PROJECT.supabase.co'
export NEXT_PUBLIC_SUPABASE_ANON_KEY='PUBLIC_ANON_KEY'
docker build --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_SUPABASE_URL \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY \
  -t oshinest:demo .
```

[Dockerfile](../../Dockerfile)は開発依存を含むビルド用ステージと実行用ステージを分け、実行時は非rootユーザーにする。[.dockerignore](../../.dockerignore)はソース・公開アセット・ビルド設定だけを許可し、`.env.local`、AWS認証情報、DB、テストを送らない。サービスキーなどの秘密をbuild argへ入れない。

`NEXT_PUBLIC_*`はNext.jsがビルド時にブラウザ用コードへ埋め込む。別のSupabaseプロジェクトへ向ける場合は再ビルドする。実行時のURL・anon keyも同じ値に揃える。`SITE_URL`と秘密値は実行時だけに設定する。

ローカルのSupabaseと本番用イメージを組み合わせる確認例（Linux）：

```bash
docker run --rm --network host --env-file .env.local \
  -e PORT=3001 -e SITE_URL=http://localhost:3001 oshinest:demo
# http://localhost:3001/api/health と /works を確認
```

`/api/health`はアプリの生存確認専用でDBへ接続しない。DB障害で全コンテナを再起動させないため。DBの可用性・ログイン・注文は別途監視する。

## AWSへの配備手順

対象アカウントはDXR `569855251962`、CLIプロファイルは `dxr`。ワークロードのリージョン、VPC・サブネット、公開ドメイン、Supabaseプロジェクトは配備時に決定する。ログイン先の `us-east-1` からワークロードのリージョンを決めない。

1. 対象と費用を確定し、ECRへイメージを登録する。デプロイ対象はイメージのdigestで固定する。
2. 下表のIAMロールと秘密値を用意する。SESの検証済み差出人・対象リージョンも揃える。
3. [service.example.json](service.example.json)のプレースホルダーを埋めて、作業用ファイルを `/tmp/oshinest-service.json` などへ保存する。秘密値はARN参照にする。
4. 確定済みリージョンを `OSHINEST_AWS_REGION` に設定し、サービスを作成する。

```bash
aws ecs create-express-gateway-service --profile dxr \
  --region "$OSHINEST_AWS_REGION" \
  --cli-input-json file:///tmp/oshinest-service.json
```

| ロール | 必要な権限 |
| --- | --- |
| Task execution role | ECRからのpull、CloudWatch Logsへの出力、指定したSSM Parameter / Secrets Managerの読み取り。カスタムKMSキーなら対象キーのDecrypt |
| Infrastructure role | ECS Express Mode用のインフラ管理権限（ALB・ターゲット・サービス等） |
| Application task role | 検証済み送信元のSES identity ARNに限定した `ses:SendEmail` |

タスク実行ロールとアプリのロールは用途が異なる。[AWSのタスク実行ロールの説明](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_execution_IAM_role.html)。コンテナへAWSアクセスキーを保存せず、アプリのSDKがタスクロールの一時認証を使う。

例は2 AZのpublic subnetを明示し、コンテナへの受信は管理されたALBに限定する。public subnetでのExpress Modeはタスクへpublic IPを割り当てる。[ネットワーク設定](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/express-service-work.html)。private subnetを使う場合は外部Supabaseへの通信経路とその費用も設計する。

初回にAWS発行ドメインを使う場合は、作成後のURLを `SITE_URL` に反映してサービスを更新する。Supabase AuthのSite URL・許可するリダイレクトURLも更新する。SESがsandboxのままなら検証済み宛先しか送れないため、一般公開前に[production access](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html)を申請する。認証用の確認コードメールはSupabase AuthのSMTP設定で扱い、この通知メール経路とは別。

このリポジトリ変更では、AWSリソースの作成・IAM変更・SESの実送信は行っていない。

## 通知メールの定期実行

1. 実行時の `MAIL_PROVIDER=ses`、`AWS_REGION`、`MAIL_FROM`、`SITE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`CRON_SECRET` を設定する。メールを止める間は `MAIL_PROVIDER=none` にする。
2. 対象SupabaseのVaultへ `oshinest_site_url` と `oshinest_cron_secret` を登録する。後者はアプリの `CRON_SECRET` と同じ値で32文字以上。
3. [schedule-emails.sql](schedule-emails.sql)を対象DBへ適用する。5分間隔、HTTPタイムアウト60秒。見積り期限切れも同じpg_cronで管理する。

[pg_cron・pg_net・Vaultの組み合わせ](https://supabase.com/docs/guides/functions/schedule-functions)を使う。EventBridge API Destinationは[応答の上限が5秒](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-api-destinations.html)なので、複数メールを同期送信するこの入口の呼び出しには使わない。

1回で最大20通知を確保し、約45秒で新規の送信開始を打ち切る。各送信は5秒で中断する。処理中の確保は5分で失効し、停止後の次回実行で回復する。まとめ受信は同じバッチ内の同一ユーザー分を1通にするため、20件を超えた場合は分かれる。

SES受理直後にDBの記録が失敗した場合などは、次回に同じメールが届き得る。送信の完全な一回保証はしない。`cron.job_run_details`だけでなく`net._http_response`のHTTPステータスとアプリログも確認する（HTTP投入の成功と配信成功は異なる）。`emailed_at is null` の件数・最古の時刻も監視し、送信が止まったまま既存の7日保持対象期間を超えないようにする。

## 実決済を使わない注文

常にデモ注文として動く。StripeのSDK・Webhook・秘密設定は不要。DBの `place_demo_order()` が価格の確定、注文・履歴・印刷ジョブの作成、在庫更新、カート消去を同じトランザクションで行う。再送には同じrequest IDを使い、注文に `is_demo=true` を記録する。

過去のマイグレーションと注文データは保持し、旧Stripe用RPCの公開実行は停止している。外部決済の履歴がある既存注文は、デモ注文へ変換しない。売上・精算画面も現在は動作確認用で、実際の課金・送金は行わない。
