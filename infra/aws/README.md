# AWSへの配備

2026-09-09。アプリと認証はECS、業務データとセッションはRDS PostgreSQL、ファイルはS3、メールはSESで完結する。実課金・送金は行わず、デモ注文、アプリ内通知、通知メールを維持する。

| 役割 | 構成 |
| --- | --- |
| Web・Server Actions・認証・3D解析 | Node.js 24 / Next.js 16 standalone、ECS Express Mode / Fargate |
| HTTP・TLS | ECS Express Modeが管理するALB |
| DB | RDS PostgreSQL 17。Kysely + pgで直接接続。RLSと業務トランザクションを継続 |
| 認証 | 同じアプリ内のBetter Auth。メール・パスワード、6桁メール確認、DBセッション、電話番号確認 |
| ファイル | 非公開S3バケット1個。work-stl / work-images / qc-photos / avatarsをキーのプレフィックスにする |
| メール・SMS | SES v2 / SNS。SDKはECSタスクロールの一時認証を使う |
| 定期処理 | 常駐するWebタスク内で5分ごとに実行。通知配信・見積り期限切れ・期限切れ認証データの削除 |

[ECS Express Mode](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/express-service-overview.html)の設定例は1 vCPU / 2 GiB、1タスク固定。新しい認証サービス・REST DBサーバー・Realtimeサーバー・常駐メールワーカーは設けない。固定費の中心はFargate・ALB・RDSで、メール/SMS・S3・ログは利用量による。実際の見積りはリージョンと負荷を決めてから行う。

## ビルドとローカル確認

```bash
docker build --platform linux/amd64 -t oshinest:demo .
# Linux。先にREADMEのローカルサービスとDBを準備する。
docker run --rm --network host --env-file .env.local \
  -e PORT=3001 -e SITE_URL=http://localhost:3001 \
  -e BACKGROUND_JOBS_ENABLED=false oshinest:demo
```

ビルド引数・DB・AWSの認証情報はビルド時に不要。同じイメージを環境変数だけ変えて配備できる。Dockerは非rootで実行し、`.env.local`をイメージに含めない。ローカルの本番モード確認ではメールはMailpitを利用できるが、SMSのMailpit代替は開発モード限定。

`/api/health`はプロセスの生存確認で、DBに依存しない。ログイン・注文・DB接続は別途監視する。

## DBの準備とマイグレーション

専用RDS PostgreSQL 17を非公開で作成し、5432番の受信はアプリのセキュリティグループと管理用経路に限定する。暗号化・バックアップ保持・削除保護・可用性はデータの重要度に合わせて設定する。コンテナの一時ディスクへDBやアップロードファイルを置かない。

1. DB作成者の接続URLを作業環境の `MIGRATION_DATABASE_URL` に設定する。これはアプリのタスクへ渡さない。
2. `DATABASE_SSL_CA=infra/aws/rds-global-bundle.pem` を設定し、`npm run db:migrate` を実行する。マイグレーションは番号順、1ファイル1トランザクションで、チェックサムと排他ロックを持つ。既存の適用済みファイルを書き換えず、新しいファイルを追加する。
3. `app_runtime` をLOGIN可能にし、生成したパスワードを設定する。パスワードは管理接続で `\password app_runtime` など対話入力し、シェル履歴・SQLファイルへ残さない。接続URLをSecrets Managerへ保存する。
4. アプリの `DATABASE_URL` はこの `app_runtime` にする。テーブル作成者やRDS管理ユーザーでアプリを動かさない。`app_runtime` はNOINHERIT、業務処理は `app_guest` / `app_user` / `app_service` へ明示的に切り替える。

`db/bootstrap.sql` は管理用のロール作成を含む。RDSユーザーにその権限が無い場合はDB管理者が先に適用する。ローカルの既知パスワード・`db:seed` はAWSには使わない。`db:seed` はローカルComposeの空DBに限定し、既存データを削除しない。

アプリには `DATABASE_SSL_CA=/app/certs/rds-global-bundle.pem` を設定する。イメージに入るのはAWSが公開したCA証明書で、秘密鍵ではない。URLにはSSLオプションを重ねず、CAとホスト名の検証を有効にする。[RDSのTLS接続](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/PostgreSQL.Concepts.General.SSL.html)、[CA配布元](https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem)。証明書のローテーション時はバンドルを更新して再ビルドする。

新構成は空のPostgreSQLへ適用するベースライン。旧環境のデータやログイン情報を自動変換する処理は含めない。既存データを移す場合は、バックアップ・ユーザーID対応・パスワード再設定・ファイルコピーを含む移送を別途行う。今回、旧ローカルDBのボリュームは保持している。

## S3・メール・SMS

S3はBlock Public Accessを有効にし、ブラウザのPOSTを許可するCORSを公開ドメインに限定する。[s3-cors.example.json](s3-cors.example.json)を使用する。アップロードの所有者・運営権限・サイズ・形式をサーバーで検査し、2分間有効な署名付きPOSTを発行する。登録時にもオブジェクトの存在とサイズを確認する。

作品画像は `/api/files/public/work-images/...` から短時間の署名付きURLへリダイレクトする。3Dファイル・検品写真を公開プレフィックスへ置かない。署名付きURLは有効期限内に共有できるため、短期間で失効させる。

認証メールと通知メールは共通のSES送信処理を使う。検証済み送信元を `MAIL_FROM`、SES/SNS/S3を使うリージョンを `AWS_REGION` に設定する。公開前に [SES production access](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html) と [SNS SMS sandbox](https://docs.aws.amazon.com/sns/latest/dg/sns-sms-sandbox.html) の制約を確認し、必要な送信許可・SMS送信元・利用上限を設定する。

## ECS設定とIAM

DXRアカウント `569855251962`、CLIプロファイル `dxr`。実際のワークロードリージョン・VPC・ドメインは配備前に決定する。AWSログインに使う `us-east-1` とローカルS3の署名用リージョンから配備先を推測しない。

[service.example.json](service.example.json)のプレースホルダーを埋める。ECRのイメージdigestを固定し、DATABASE_URLと32文字以上のランダムなAUTH_SECRETはSecrets ManagerのARNで指定する。`SITE_URL` は実際のHTTPSオリジンに一致させる。AWSでは `S3_ENDPOINT`、ローカルS3キー、Mailpit設定を渡さない。

| IAMロール | 権限 |
| --- | --- |
| Task execution role | ECR pull、CloudWatch Logs、指定したDB/Auth秘密の取得。カスタムKMSキーを使うなら対象キーのDecrypt |
| Infrastructure role | ECS Express ModeのALB・ターゲット・サービス管理 |
| Application task role | 対象バケット内のGetObject/PutObject、検証済みSES identityへのSendEmail、電話番号へのSNS Publish |

[task-policy.example.json](task-policy.example.json)はアプリロール用の例。SNSの電話番号宛送信はResourceを電話番号ARNへ限定できないため、sns:Publishを送信先リージョンに限定し、SMS利用上限も設定する。アプリのHTTP受信はALBからに限定し、ALBのX-Forwarded-Forはappend設定で使用する。

アプリとRDSのネットワーク到達性を確認する。例はpublic subnetのFargateタスクから非公開RDSへ接続する構成で、DBをpublicにする必要はない。private subnetでFargateを動かす場合はECR・ログ・S3・SES・SNSへの経路と費用も用意する。

配備するリソース・アカウント・リージョン・範囲を確認し、設定ファイルを作業用に用意した後で実行する。

```bash
aws ecs create-express-gateway-service --profile dxr \
  --region "$OSHINEST_AWS_REGION" \
  --cli-input-json file:///tmp/oshinest-service.json
```

この変更ではAWSリソースの作成・IAM変更・実メール/SMSの送信は行っていない。

## 定期処理の運用

`BACKGROUND_JOBS_ENABLED=true` の常駐タスクが5分ごとに処理する。スケールを0にすると処理も止まるため、最低1タスクを維持する。別のキュー・スケジューラ・公開cron URLは不要。プロセス内では処理を重ねず、複数タスク間はDBの通知リースで重複取得を防ぐ。

1回に最大20通知、送信開始の期限45秒、各メール5秒、リース5分。異常終了しても次回に再取得できる。SES受理後にDBの配信記録が失敗した場合は再送され得る。CloudWatchの `Background jobs failed` / `Notification delivery` と、未配信通知の最古時刻を監視する。負荷が増えたらバッチ量または専用ワーカーを検討する。
