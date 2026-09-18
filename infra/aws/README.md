# AWS運用

対象：**small-vlm-sop-check / 796093524263 / ap-northeast-1（東京）**。既存VLMサービスとは別のOshiNest専用リソース。

[公開デモ](https://2ku246qcgjm7yh37q4xrrxubhy0oyazc.lambda-url.ap-northeast-1.on.aws/)

## 構成

| 定義 | リソース |
| --- | --- |
| [foundation.json](foundation.json) | 専用VPC・2AZのprivate subnet・IPv6外向き通信・S3 endpoint、Aurora PostgreSQL 17.6、S3、ECR、Secrets Manager、IAM |
| [application.json](application.json) | Next.js + Lambda Web Adapter、Lambda 2GiB / 120秒、公開Function URL（BUFFERED）、ログ7日 |

Auroraはwriter 1台、0〜1 ACU、接続なし300秒で自動停止する設定。暗号化・非公開、バックアップ1日、削除保護あり。NAT Gateway・ALB・CloudFront・RDS Proxyは使わない。DB停止中も保存領域などの費用は残る。

- `DEMO_GUEST_ENABLED=true`：ブラウザごとのゲスト購入・投稿。管理者権限なし。
- `MAIL_PROVIDER=none` / `SMS_PROVIDER=none`：外部通知なし。実決済・送金もなし。
- `AR_MODEL_STORAGE=s3`：非公開S3へ生成物を保存し、署名付きURLで取得。作品ARのキャッシュ照会には `ar-cache/*` に限定したListBucket権限を使う。
- DBと認証の秘密はSecrets Managerで管理。アプリには管理用DB接続を渡さない。RDSのCA検証を有効にする。

## 配備・更新

リポジトリルートで実行する。CloudFormationを配備定義の唯一の入口とし、個別のLambda/RDS作成用JSONは使わない。CI/CDは未設定。

```bash
export OSHINEST_AWS_PROFILE=small-vlm-sop-check
export OSHINEST_AWS_REGION=ap-northeast-1
export OSHINEST_AWS_ACCOUNT=796093524263
aws sso login --profile "$OSHINEST_AWS_PROFILE" --use-device-code --no-browser
aws sts get-caller-identity --profile "$OSHINEST_AWS_PROFILE" --region "$OSHINEST_AWS_REGION"
```

1. 基盤は `oshinest-demo-foundation` に `foundation.json` を適用。初回はcreate-stack、更新はupdate-stackを使い、既存のSiteUrlを保持する。IAMを含むため `CAPABILITY_IAM` を指定し、完了を待つ。
2. `docker build --platform linux/amd64 --provenance=false -t oshinest:deploy .` でビルド。ECR `oshinest-demo` に一意のタグでpushする。
3. ECRのdigest付きURIを `OSHINEST_IMAGE_URI` に設定。初回は `node infra/aws/deploy-application.mjs application`。更新時は下記コマンドを使う。
4. 初回のみアプリ作成完了後、`node infra/aws/deploy-application.mjs configure-url` でSiteUrlとS3 CORSを実URLへ合わせる。
5. `/api/health` とゲスト投稿・購入・管理画面拒否を確認する。

```bash
# 新しいイメージのdigest URIをOSHINEST_IMAGE_URIに設定してから実行
node infra/aws/deploy-application.mjs update
```

更新処理は対象アカウントを照合し、既存パラメータを保持してアプリのCloudFormationを更新する。ARキャッシュ権限を追加する今回の変更は、基盤更新を先に適用する。

## DB変更

Lambda起動時にはマイグレーションしない。DB変更がある場合、アプリ更新の前に一時的な管理用Lambdaで適用する。

```bash
python3 infra/aws/package-migration.py
node infra/aws/deploy-application.mjs migration
aws lambda wait function-active-v2 --profile "$OSHINEST_AWS_PROFILE" --region "$OSHINEST_AWS_REGION" --function-name oshinest-demo-migrate
aws lambda invoke --profile "$OSHINEST_AWS_PROFILE" --region "$OSHINEST_AWS_REGION" --function-name oshinest-demo-migrate --cli-read-timeout 650 /tmp/oshinest-migration-result.json
# FunctionErrorがなく、結果のok:trueを確認してから削除する
aws lambda delete-function --profile "$OSHINEST_AWS_PROFILE" --region "$OSHINEST_AWS_REGION" --function-name oshinest-demo-migrate
```

AWSでは開発用 `db:seed` を実行しない。S3のRetainとDBの削除保護を維持する。

## 配備記録・残る確認

2026-09-18の配備ではマイグレーション0001〜0011を適用。ゲスト投稿・別ゲストとの下書き分離・AR取得・デモ購入・管理画面404を確認。今回のリファクタリングは別途再配備するまで公開環境に反映されない。

- DBの停止・復帰時間、実利用料金、iOS/Android実機ARは未確認。
- 前回イメージのInspectorにベースOS由来の指摘あり（CRITICAL 3件：perl-base、当時修正版なし）。更新時に再スキャンする。
- ゲストCookie削除後のデータ復元は提供しない。検証で作ったデータはデモDBに残る。
