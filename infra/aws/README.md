# AWSへの配備（低利用の学習環境）

2026-09-09。Next.jsを維持し、アクセス時だけ動くLambdaと、自動停止するAurora Serverless v2を使う。実課金・送金は行わない。アプリ内通知と認証メールは通常どおり使い、通知メールとデータ整理は管理画面から手動で実行する。

| 役割 | 構成 |
| --- | --- |
| Web・認証・3D解析 | Next.js 16 / Node.js 24 standalone + Lambda Web Adapter。まず1 GiB、120秒で検証 |
| HTTPS | Lambda Function URL。ログイン・権限確認はアプリで実行 |
| DB | Aurora PostgreSQL 17互換 / Serverless v2、writer 1台、0〜1 ACU、接続なし300秒で自動停止 |
| ファイル | 非公開S3バケット1個。ブラウザから署名付きURLで直接アップロード |
| メール・SMS | SES v2 / SNS。Lambda実行ロールの一時認証を使用 |
| 通知送信・整理 | `/admin/maintenance` の管理者操作。スケジューラや定期DB照会は設けない |

ECS・ALB・NAT Gateway・RDS Proxy・常駐ワーカーはこの構成に含めない。認証、所有者の確認、DBのTLSと基本的なアクセス制限は維持する。WAFや追加の認証基盤は導入しない。

Lambdaの常時起動設定は使わず、DB停止中は計算資源の料金が発生しない。ただしDBストレージ・バックアップ・Secrets Manager・S3・ECR・ログなどの費用は残る。復帰時はDBだけで通常約15秒、長時間停止後は30秒以上かかる場合がある。連続アクセスするとDBは停止しないため、月額はリージョンと使用時間を決めて見積もる。[Auroraの自動停止・復帰](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2-auto-pause.html)

## ビルドとローカル確認

```bash
docker build --platform linux/amd64 --provenance=false -t oshinest:lambda .
# Linux。先にルートREADMEのローカルサービスとDBを準備する。
docker run --rm --network host --read-only --tmpfs /tmp --env-file .env.local \
  -e PORT=3001 -e SITE_URL=http://localhost:3001 oshinest:lambda
```

同じイメージを通常のNodeサーバーとしても実行できる。Dockerfileに[AWS Lambda Web Adapter](https://aws.github.io/aws-lambda-web-adapter/getting-started/docker-images.html)のバイナリを追加しており、Lambdaでは拡張機能として起動する。アプリの新しい依存パッケージや独自ランタイムは追加していない。アダプターは1.0.1のdigestを固定している。

ビルド時のDB接続・秘密値は不要。`.env.local`はイメージに含めない。`/api/health`はDBを使わない起動確認用で、DBを起こす監視やウォームアップは設定しない。

## ネットワーク

Lambdaと非公開DBを同じVPCへ配置する。NAT Gatewayの固定費を避けるため、外向きのAWS API通信にはIPv6を使う。

1. 2つのAZにIPv4・IPv6両方のCIDRを持つサブネットを用意する。Lambdaの選択サブネットは全てdual-stackにする。
2. サブネットの `::/0` をegress-only internet gatewayへ向け、外向きHTTPSを許可する。DBにはVPC内のIPv4経路で接続する。
3. DBの5432番はLambdaのセキュリティグループと、マイグレーション時の管理用経路から許可する。DBを公開しない。
4. Lambdaに `Ipv6AllowedForDualStack=true` と `AWS_USE_DUALSTACK_ENDPOINT=true` を設定する。S3・SES・SNSを同じワークロードリージョンに置く。

[LambdaのIPv6接続](https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc.html)、[egress-only internet gateway](https://docs.aws.amazon.com/vpc/latest/userguide/egress-only-internet-gateway.html)、[SESのdual-stackエンドポイント](https://docs.aws.amazon.com/general/latest/gr/ses.html)、[SNSのdual-stack設定](https://docs.aws.amazon.com/sns/latest/dg/sns-dual-stack.html)を参照。IPv4だけのサブネットへ設定例をそのまま適用すると外部APIに到達できない。

## DBの作成と準備

DXRアカウント `569855251962`、CLIプロファイル `dxr`。**実際のワークロードリージョンとリソースの範囲は配備前に決定する。** ログインの `us-east-1` やローカルS3の署名用リージョンから推測しない。このディレクトリのファイルは設定例であり、AWSへの作成・変更はまだ行っていない。

[aurora.example.json](aurora.example.json)のバージョン・サブネットグループ・セキュリティグループを埋め、作業用ファイルへ保存する。対象リージョンで0 ACUへの自動停止をサポートするPostgreSQL 17互換バージョンを選ぶ。未対応の場合にMinCapacityを0.5へ変えると常時課金に戻るため、先に利用可否を確認する。

```bash
: "${OSHINEST_AWS_REGION:?Set the agreed workload Region}"
aws rds create-db-cluster --profile dxr --region "$OSHINEST_AWS_REGION" \
  --cli-input-json file:///tmp/oshinest-aurora.json
aws rds create-db-instance --profile dxr --region "$OSHINEST_AWS_REGION" \
  --db-instance-identifier oshinest-demo-writer --db-cluster-identifier oshinest-demo \
  --engine aurora-postgresql --db-instance-class db.serverless \
  --no-publicly-accessible --no-enable-performance-insights
```

DB接続を維持するRDS ProxyやDB監視クライアントを追加すると自動停止を妨げる。アプリはLambdaで接続を返すたびに切断し、トランザクションの途中だけ同じ接続を保持する。接続タイムアウトは復帰待ちを含め60秒、SQL実行は30秒。ローカルdevは通常の接続プールを使う。

マイグレーションはDBへ接続できる作業環境から実行する。Lambda起動時には実行しない。

1. DB作成者のURLを作業環境の `MIGRATION_DATABASE_URL` に設定する。管理パスワードはAuroraが作成したSecrets Managerの秘密から取得する。
2. `DATABASE_SSL_CA=infra/aws/rds-global-bundle.pem` を設定し、`npm run db:migrate` を実行する。番号順、1ファイル1トランザクションで適用する。
3. `app_runtime` をLOGIN可能にし、管理接続の `\password app_runtime` などでパスワードを設定する。アプリの `DATABASE_URL` はこのユーザーとcluster writer endpointを使う。管理用URLはアプリへ渡さない。

`db/bootstrap.sql`は管理用のロール作成を含む。権限が足りなければDB管理者が先に適用する。アプリは `app_guest` / `app_user` / `app_service` へ切り替えて業務データを操作する。AWSではローカルの既知パスワードや `db:seed` を使わない。

アプリの `DATABASE_SSL_CA` は `/app/certs/rds-global-bundle.pem`。CAとホスト名を検証し、接続URLにSSLオプションを重ねない。[RDSのTLS](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/PostgreSQL.Concepts.General.SSL.html)、[CA配布元](https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem)。証明書の更新時はバンドルを更新して再ビルドする。

新構成は空のPostgreSQLへ適用するベースライン。旧環境のデータ移送・認証情報の自動変換は含めない。旧ローカルDBのボリュームは保持している。

## Lambda・S3・メール

実行ロールの信頼先を `lambda.amazonaws.com` とし、VPC接続とログにはAWS管理ポリシー `AWSLambdaVPCAccessExecutionRole`、アプリには [lambda-policy.example.json](lambda-policy.example.json) の対象リソースを指定する。ECRはLambdaと同じリージョンに作成し、ビルドした単一アーキテクチャのイメージをpushする。

[lambda.example.json](lambda.example.json)のイメージdigest・ロール・ネットワーク・環境変数を埋める。`DATABASE_URL` と32文字以上の `AUTH_SECRET` はLambda環境変数に実値を設定する。Secrets ManagerのARNを入れるだけでは展開されない。秘密を含む作業用JSONはリポジトリへ保存しない。

`AWS_REGION` はLambdaが設定するため環境変数のVariablesへ追加しない。`S3_ENDPOINT`・ローカルS3キー・Mailpit設定も渡さない。SESの検証済み送信元を `MAIL_FROM` に指定し、学習時は [SES sandbox](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html) / [SNS SMS sandbox](https://docs.aws.amazon.com/sns/latest/dg/sns-sms-sandbox.html) 内の宛先を使う。

Function URLは関数作成後に確定するため、初回の `SITE_URL` は `https://setup.invalid` として関数を作成し、URL取得後に更新する。公開アクセス許可はその後に追加する。

```bash
aws lambda create-function --profile dxr --region "$OSHINEST_AWS_REGION" \
  --cli-input-json file:///tmp/oshinest-lambda.json
aws lambda wait function-active-v2 --profile dxr --region "$OSHINEST_AWS_REGION" \
  --function-name oshinest-demo
aws lambda create-function-url-config --profile dxr --region "$OSHINEST_AWS_REGION" \
  --cli-input-json file://infra/aws/function-url.example.json
```

返されたHTTPS URLの末尾 `/` を除いて `SITE_URL` を更新する。作業用JSONの `Environment` オブジェクト全体を `/tmp/oshinest-lambda-env.json` へ保存し、次で適用する。環境変数の更新は全置換なので、他のキーも含める。

```bash
aws lambda update-function-configuration --profile dxr --region "$OSHINEST_AWS_REGION" \
  --function-name oshinest-demo --environment file:///tmp/oshinest-lambda-env.json
aws lambda wait function-updated-v2 --profile dxr --region "$OSHINEST_AWS_REGION" \
  --function-name oshinest-demo
aws lambda add-permission --profile dxr --region "$OSHINEST_AWS_REGION" \
  --function-name oshinest-demo --statement-id PublicFunctionUrl \
  --action lambda:InvokeFunctionUrl --principal '*' --function-url-auth-type NONE
aws lambda add-permission --profile dxr --region "$OSHINEST_AWS_REGION" \
  --function-name oshinest-demo --statement-id InvokeViaFunctionUrl \
  --action lambda:InvokeFunction --principal '*' --invoked-via-function-url
```

公開WebアプリのためFunction URLは `AuthType=NONE`。会員の認証はBetter Authが担当し、運営画面・Server Actions・ファイル参照の権限確認を維持する。[Function URLには両方の呼び出し許可が必要](https://docs.aws.amazon.com/lambda/latest/dg/urls-auth.html)。認証のIP制限はLambdaが渡す `requestContext.http.sourceIp` を使う。

S3のBlock Public Accessを有効にし、[s3-cors.example.json](s3-cors.example.json)のoriginを同じFunction URLへ変更して適用する。ブラウザのアップロードはS3へ直接送る。作品画像は `/api/files/public/work-images/...` から署名付きURLへリダイレクトし、3Dファイル・検品写真は権限を確認して取得する。

この例はVPC接続したFunction URLなので **BUFFERED** を使う。[ストリーミングの制約と6 MBの応答上限](https://docs.aws.amazon.com/lambda/latest/dg/configuration-response-streaming.html)がある。大きいファイルをLambda経由で転送せず、S3直接転送を維持する。3D解析の最大入力に対するメモリ・時間は未計測のため、1 GiB / 120秒を実用上限として保証しない。実データで確認して調整する。

## 通知送信と停止の確認

管理者で `/admin/maintenance` の「通知送信と整理を実行」を押す。期限切れ見積り、古い通知、期限切れ認証データを整理し、配信時刻を過ぎた通知を最大20件処理する。認証時のメール送信とアプリ内通知はこの操作を待たない。見積り承認では有効期限をその場で検査するため、整理前でも期限切れの承認はできない。

メールの送信開始期限は45秒、各メールは5秒。リースは5分で失効し、未送信分は再操作で回復する。SES受理後のDB記録に失敗すると再送される場合がある。7日を超えた通知は配信対象外。毎日決まった時刻の配送は保証しない。

配備後は画面・ログイン・S3アップロード・解析・認証メール・管理者の手動送信を確認する。その後、ブラウザとDBクライアントを閉じて待ち、CloudWatchの `ServerlessDatabaseCapacity=0` を確認する。次のアクセスで復帰できることも確認する。これらのAWS上の確認はまだ未実施。
