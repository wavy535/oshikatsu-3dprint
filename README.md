# OshiNest（オシネスト）

推しぬいのおうち・家具・小物を制作・公開し、3Dプリントで届けるサービス。CAD未経験者がスマートフォンから制作できることを目指します。**注文・送金はデモ**です。

## 機能と構成

- `/create`: 手動・AIによる設計編集、画像入力、端末保存、3MF ZIP・GLB・USDZ出力。同じ制作コアをCLIから使えます。
- マーケット: 検索、マイぬい、寸法確認、お気に入り、AR、デモ注文、相談・メッセージ。
- 制作・運営: STL/3MF投稿、解析、価格・在庫、公開、製造・検品・発送状態と実費の管理。
- 公開設定: メール未確認で一般会員登録を許可。メール・SMS送信、クリエイター申請、匿名ゲスト登録を停止。

| 役割 | 技術 |
| --- | --- |
| Web | React / TypeScript / Tailwind、vinext / Vite → Cloudflare Workers |
| 認証・DB | Better AuthのDBセッション、D1 / Kysely |
| ファイル | 非公開R2、操作・期限・サイズを限定した署名URL |
| 投稿解析・AR変換 | 非公開Geometry Worker / Containers |
| ブラウザ制作 | Three.js、Manifold WASMの専用Web Worker |
| AI編集 | OpenAIの構造化出力と制限付き造形コード、適用前の検証 |

`next/*` はvinextの互換実装で処理し、Next.jsパッケージは型・lint用の開発依存として残しています。PostgreSQLは旧実装との比較用で、通常開発・本番では使いません。

上記はリポジトリの実装と設定です。公開URL・配備手順は [Cloudflare](infra/cloudflare/README.md) を参照し、現在配信中の版は配備時に確認します。自動形状検査は実プリント・強度・実機ARの適合を保証しません。

## ローカル開発

Node.js 24とDockerを使います。既存の設定ファイルを上書きせず、seedは空のローカルDBだけに実行してください。

```bash
npm ci
# .dev.vars がない場合だけコピー
cp -n .dev.vars.example .dev.vars
# .dev.vars の AUTH_SECRET に openssl rand -hex 32 の生成値を設定
npm run cf:types
npm run dev:services
npm run db:migrate
npm run db:seed
```

別々のターミナルで起動します。

```bash
npm run dev:geometry:local
npm run dev
```

アプリは http://localhost:3000 、ローカルD1・R2は `.wrangler/state`。開発会員は `buyer@example.com` / `creator@example.com` / `creator2@example.com` / `admin@example.com`、共通パスワードは `password123`。公開環境へseedしません。既存DBの画像だけを準備する場合は `npm run db:seed:storage` を使います。

AI接続は [AIチャット](docs/design-ai-chat.md)、Containersの起動・本番ビルド・配備は [Cloudflare手順](infra/cloudflare/README.md)。停止時はdevプロセスを終了し、`docker compose stop geometry`。データは保持します。

## 検証

```bash
npm run typecheck
npm run lint
npm test
npm run check:compat
npm run build
```

R2・Geometry・ブラウザ試験は起動環境が別途必要です。実行条件とテストの過不足は [テスト方針](docs/testing.md) を参照してください。`npm run test:db` は `npm test` の部分集合で、連続実行は不要です。

## ドキュメント

[目的別の一覧](docs/README.md) を入口に、仕様・手順・決定事項を管理します。業務上の制約は [実装構成](docs/architecture.md)、技術選定は [設計上の決定](docs/product-architecture.md)、制作機能は [エディタ仕様](docs/house-editor.md) を参照してください。過去の構成・Figma・計測記録は [archive](docs/archive/README.md) に分離しています。
