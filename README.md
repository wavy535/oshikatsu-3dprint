# OshiNest（オシネスト）

推しぬい向けの小物や家具を、3Dプリントで作って届けるマーケットプレイスです。クリエイターが3Dデータと印刷指示を登録し、運営が印刷・検品・発送を担当します。

現在は**実課金・送金を行わない学習用のデモ**です。AWSにゲスト体験版を配備済みです。ローカルでは運営操作を含めて試せます。

## 主な機能

| 利用者 | できること |
| --- | --- |
| 購入者 | 作品検索、マイぬいのサイズ登録・相性確認、お気に入り、デモ注文、受け取り評価、メッセージ・オーダーメイド相談 |
| クリエイター | 複数3MF/STLの一括投稿・自動検証、AR用モデル・画像の登録、印刷指示、サイズ別の価格・在庫設定、作品公開、見積り・修正依頼への対応、売上・振込申請の管理 |
| 運営 | クリエイター審査、印刷・検品・発送、材料在庫、実費・払込の記録、通知メールの手動配信 |

作品の投稿は「データ検証 → 印刷指示 → 作品情報・サイズ設定 → 公開」の4ステップです。購入者は完成品を注文し、運営が「印刷 → 検品 → 発送」を進めます。価格・在庫・印刷代行費はサイズごとに管理します。

STEP1では1作品に最大16個の印刷用ファイルを登録できます（一度の送信は合計80MiBまで）。全ファイルを1作品分として見積り、ファイルごとに印刷指示を設定します。追加と個別の差し替えに対応しています。

STEP4で画像を複数選び、サムネイルを設定します。AR用の組み立て済みモデル（STL・3MF・Blender、80MiBまで）は同じ画面で任意登録します。印刷用とは別保存で、AR未登録の作品は印刷データをARに流用しません。基準の15cm用の実寸で用意してください（STL・3MFはmm、Blenderは1単位100mm）。

## ゲスト体験版

[公開デモを開く](https://2ku246qcgjm7yh37q4xrrxubhy0oyazc.lambda-url.ap-northeast-1.on.aws/)。ゲストとして購入・作品投稿を試せます。管理者権限・実課金・メール送信はありません。データはブラウザごとに分かれます。

この動作は `DEMO_GUEST_ENABLED=true` を指定した専用環境だけで有効です。通常のローカル開発では既存のログインを使います。配備構成・検証結果は [AWS配備手順](infra/aws/README.md) を参照してください。

## 構成

| 役割 | 技術 |
| --- | --- |
| Webアプリ | Next.js 16 / React / TypeScript / Tailwind CSS |
| 認証 | Better Auth |
| DB | PostgreSQL / Kysely |
| ファイル | S3（ローカルはMinIO） |
| メール・SMS | SES / SNS（ローカルはMailpit） |

AWSではLambda Web AdapterでNext.jsを動かし、DBにAurora Serverless v2の自動停止を使う構成です。[AWS運用手順](infra/aws/README.md)に配備構成をまとめています。DBの自動停止・復帰時間は未計測です。

通知メールの配信と期限切れデータの整理は `/admin/maintenance` から手動実行します。認証メールは認証時に送信し、アプリ内通知は業務操作に応じて生成します。

## 開発環境

Node.js 24とDocker Composeを使用します。初回は次の順で準備します。

```bash
npm ci
cp .env.local.example .env.local
# openssl rand -hex 32 で生成した値を .env.local の AUTH_SECRET に設定
npm run dev:services
npm run db:migrate
npm run db:seed   # 初回の空DBだけ。開発用の会員・作品・画像を作成
npm run dev
```

| サービス | 接続先 |
| --- | --- |
| アプリ | http://localhost:3000 |
| Mailpit（メール・開発用SMSコード） | http://localhost:58025 |
| PostgreSQL | `127.0.0.1:55432` |
| MinIO | API: http://localhost:59000 / 管理画面: http://localhost:59001 |

開発用のログインは `buyer@example.com` / `creator@example.com` / `creator2@example.com` / `admin@example.com`、共通パスワードは `password123` です。

再開時は `npm run dev:services` → `npm run db:migrate` → `npm run dev`。停止は `docker compose stop` で、DBとファイルはボリュームに残ります。

設定項目は [.env.local.example](.env.local.example) を参照してください。`DATABASE_URL` はアプリ用、`MIGRATION_DATABASE_URL` は管理用です。AWSのアプリには管理用URLを渡しません。

## 検証

ローカルDBを準備してから実行します。

```bash
npm run lint
npx tsc --noEmit
TEST_DATABASE=true npm test
npm run test:db
npm run build
```

ブラウザテストは開発サーバーとMailpitを起動して実行します。ローカルDBにテスト用の会員・注文・作品が追加されます。

```bash
npx playwright install chromium # 初回のみ
npm run test:e2e
```

DB変更後の型生成は `npm run db:types`、3D解析単体の確認は `npm run analyze -- tests/fixtures/tetrahedron.stl` を使います。

本番の表示性能は、ビルド後に別ターミナルでstandaloneサーバーを起動して計測できます。

```bash
cp -a .next/static .next/standalone/.next/
cp -a public .next/standalone/
PORT=3100 HOSTNAME=127.0.0.1 SITE_URL=http://localhost:3100 node --env-file=.env.local .next/standalone/server.js
# 別ターミナル：作品詳細のパスも指定可能
npm run perf:frontend -- /works
```

390px幅・CPU 4倍スロットリング・ブラウザキャッシュなしで3回計測します。LCP、CLS、FCP、TTFB、初期JavaScript量をJSONに出力します。ローカル環境の比較用で、実ユーザーのINPや通信環境を表す数値ではありません。

## ドキュメント

- [実装構成と制約](docs/architecture.md)：認可、投稿、AR、データ取得の方針
- [AWSの配備手順](infra/aws/README.md)：現在の構成、配備・更新、確認事項
- [画面デザイン資料](docs/design.md)：Figmaの47画面、ノードID、デザイントークン
- [開発再開時の注意](HANDOFF.md)
