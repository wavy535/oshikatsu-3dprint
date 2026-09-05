# Oshinest（推し活3Dプリント受託販売プラットフォーム）

推しぬい向けの3Dプリント作品マーケットプレイス。クリエイターがSTLデータを投稿し、
運営が印刷・検品・発送を代行、売上を月次でクリエイターへ精算する。

**仕様の source of truth は [`DESIGN.md`](./DESIGN.md)。** 実装の判断に迷ったら
まずこれを読む。DBスキーマとRLSは設計書に沿って一括適用済みなので、機能追加は
アプリケーション層と、設計書に無い/不足しているトリガー・RPCの追加で行う。

## 技術スタック

| 領域 | 使用技術 |
|---|---|
| フレームワーク | Next.js (App Router) / TypeScript |
| DB・認証・ストレージ | Supabase (Postgres + RLS) |
| 決済 | Stripe Checkout + Webhook |
| UI | Tailwind CSS + shadcn/ui |
| 定期実行 | Vercel Cron（月次精算の締め） |

## 実装済みの機能

- 認証（マジックリンク / Google）、プロフィール、マイぬい、配送先
- 作品の投稿・審査・公開（STLは非公開のまま、運営のみ取得可能）
- カート、Stripe決済、注文ステータス管理、配送情報
- クリエイター精算（口座情報はpgcryptoで暗号化、月次締めはCron、CSV出力）
- メッセージ、レビュー、コーデ投稿

## セットアップ

```bash
npm install
cp .env.local.example .env.local   # 各キーを設定する
npx supabase start                 # ローカルSupabase（要Docker）
npx supabase db reset              # マイグレーション適用 + seed投入
npm run dev
```

型定義はスキーマ変更のたびに再生成する。

```bash
npx supabase gen types typescript --local > src/types/database.types.ts
```

### ローカル環境の注意点

- ログインUIは**マジックリンクとGoogleのみ**。パスワードログインの画面は無い。
  ローカルのメールは Mailpit（http://127.0.0.1:54324）で受信する。
- `npx supabase db reset` は `auth.users` も消すため、テストユーザーは作り直しになる。
- `profiles.role` / `is_creator` は `guard_profile_privilege` トリガーにより
  service_role経由でも更新が弾かれる。テストデータ投入時はトリガーを一時無効化する。
- クリエイター画面のガードは `is_creator` ではなく
  `creator_profiles.status = 'approved'` を見る。

## ディレクトリ構成

```
src/
  app/            ルーティング（(shop) (account) (creator) (admin) の4グループ）
  features/       機能単位の schema / queries / actions
  components/     UIコンポーネント
  lib/            Supabase・Stripeクライアント、認証ガード
supabase/
  migrations/     スキーマ・RLS・トリガー・RPC
docs/
  screen-flow.html  Figmaの画面フローを再現したプロトタイプ（ブラウザで開く）
```

Server Action は「認証確認 → zodバリデーション → DB操作 → revalidatePath」の順で書き、
戻り値は `ActionResult<T>` に統一している。

## 画面設計

デザインは Figma「推し活2」。キャンバス上の矢印が画面遷移を表す。
`docs/screen-flow.html` はそれを再現したクリック可能なプロトタイプで、
Figmaを開かずに全15画面と導線を確認できる。
