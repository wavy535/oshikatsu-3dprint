# OshiNest 引き継ぎメモ（CLI で続きをやる用）

この文書には初期実装時点の状況が含まれます。現行の実装状況は [README](README.md)、アーキテクチャの診断と改善順は [docs/architecture.md](docs/architecture.md) を参照してください。「守ってほしい設計上の判断」は引き続き適用します。

ここまでの作業はブラウザ側で進めていました。CLI に移るにあたって、**状態・決めごと・次にやること・ハマりどころ**をまとめます。仕様そのものは `README.md` に書いてあるので、こちらは「作業を再開するために知っておくこと」だけです。

---

## 1. いま何がある

| 領域 | 状態 |
|---|---|
| Figma | 2ファイル（内容は完全に同一）／全38画面／8レーン／プロトタイプ結線済み |
| DB | `0001` 〜 `0010` まで作成、ローカル PostgreSQL 16 で通し適用と動作確認まで完了 |
| コード | 認証・クリエイター申請・**3Dデータ検証パイプライン**は実装済み。それ以外の画面はほぼ未実装 |

### Figma ファイル

| ファイル | fileKey |
|---|---|
| 推し活2（主に編集していた方） | `Uq0qSH9CNHQrTO5Lh7ICW4` |
| 推し活（ミラー） | `WP1mtUcOmN2BXq6NK8REBJ` |

**2ファイルは常に同じ内容に保つ**、というのがこれまでのルールです。片方に画面を足したら必ずもう片方にも同じスクリプトを流しています。

レーン構成（キャンバス上の並び）：

```
⓪ 共通（入口）                              3画面
① 購入フロー（買う人）                       9画面
② 出品フロー（作る人）                       9画面
③ やりとり・相談                            4画面
④ マイページのタブ（使う頻度順）              6画面
⑤ 運営オペレーション                        3画面
⑥ モバイル                                  2画面
⑦ 参考：うちの子で見る（アストラ連携・構想）   2画面 ← 本線から外した参考
```

1画面あたりの情報量を減らす方向で整理してあります。作品詳細は「買うのに必要なもの」だけを残し、レビューと Q&A・発送は別画面に切り出しました（★の平均と件数だけは作品詳細に残しています）。サイドバーの並びも使う頻度順で、購入履歴 → 通知 → お気に入り → メッセージ → マイぬい → 配送先・お支払い → 通知設定 です。

### マイグレーション

```
0001_init.sql                    基本スキーマ
0002_rls.sql                     RLS
0003_storage.sql                 バケットとポリシー
0004_creator_applications.sql    クリエイター申請・審査（buyer→creator）
0005_variants_and_print_specs.sql サイズ展開・印刷仕様・代行費の計算
0006_print_ops.sql               印刷ジョブ・検品・発送・フィラメント台帳
0007_variant_part_bbox.sql       パーツ単体でのベッド判定
0008_quotes_revisions_reviews.sql オーダーメイド見積り・修正依頼・評価軸の分離
0009_favorite_ranking.sql        いいね数の集計と人気順
0010_notifications_and_nui.sql   通知・マイぬい・内寸と相性判定
```

### 実装済みのコード

- `src/lib/print/` — 3MF/STL パーサとメッシュ解析（依存ライブラリなし・約1,850行）。実データ `diorama.3mf`（313,348三角形）で3秒、スライサー実測 438g に対して推定 464.4g（+6.0%）まで詰めてあります
- `src/lib/works/asset-validation.ts` — 解析結果を `work_validation_issues` などに書き込むパイプライン
- `src/lib/works/actions.ts` — `validateAssetAction`（Server Action）
- `src/types/database.ts` — 手で維持している型定義。`0010` の分まで反映済み
- `scripts/analyze-file.ts` / `scripts/verify-pipeline.ts` / `scripts/verify-0010.sql`

---

## 2. 再開の手順

```bash
unzip osinest-source.zip && cd osinest
npm install
cp .env.local.example .env.local   # Supabase の URL / キーを入れる
```

`next dev` を一度も走らせていない環境だと `src/app/layout.tsx` で `LayoutProps` が見つからないという tsc エラーが出ます。これは Next が生成する型がまだ無いだけなので、`npm run dev` を一度動かせば消えます。

### ローカルでマイグレーションを検証する

Supabase に当てる前にローカル PostgreSQL で通します。`auth.uid()` などの Supabase 固有のものはシムで埋めています（`scripts/pg-shim.sql`）。

```bash
createdb osinest_test
psql -d osinest_test -f scripts/pg-shim.sql
for f in supabase/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -d osinest_test -f "$f"; done
psql -d osinest_test -f scripts/verify-0010.sql   # 23項目の動作確認
```

`verify-0010.sql` は最後に `rollback` するので、何度流してもDBは汚れません。同じ作りの検証スクリプトを新しいマイグレーションごとに足していく形にしています。

---

## 3. 守ってほしい設計上の判断

作った理由まで含めて書きます。ここを崩すと画面とDBが食い違います。

1. **代行費は項ごとに丸める。** SQL の `calc_print_fee()` は材料費・機械費をそれぞれ `round` してから足します。JS 側（`calcPrintFeeJpy`）も同じ順序で丸めないと ¥1 ずれて、画面の表示とDBの値が食い違います。最終的な金額は**DBから読み戻す**のが原則です。

2. **通知はアプリから呼ばない。** `push_notification()` を叩くのは DB のトリガーだけです（発送・印刷開始・値下げ・メッセージ・販売・修正依頼・レビュー・見積り）。アプリ側から呼ぶ形にすると、呼び忘れで通知が届かない事故が必ず起きます。

3. **通知には必ず行き先がある。** `notifications.link_path` は NOT NULL です。「◯◯しました」で終わる通知は、読んだ人が次に何をすればいいか分からず、結局サポートへの問い合わせになります。

4. **取引に関わる通知はアプリ内でオフにできない。** 発送・修正依頼・入金は check 制約（`mandatory_kinds_stay_in_app`）で止めています。UI だけの制限にしていません。

5. **サイズの相性は数値で判定する。** 合成イメージの見た目ではなく `fit_*_mm` と `nui_profiles` の採寸値を比べます（`judge_axis()`）。生成モデルの精度に可否が引きずられると、届いてから揉めます。画像は納得のための表現です。

6. **内寸は原寸だけ入力する。** 他のサイズは `scale_ratio` を掛けてトリガーが埋めます（`fit_source='auto'`）。クリエイターに3サイズぶん入力させると埋まりません。

7. **検品NGの原因が `model` のときだけクリエイター負担。** `charged_to_creator` は原因から自動で決まります。運用で取り違えられない形にしてあります。

8. **レビューはクリエイター向けと運営向けを分ける。** デザイン・説明との一致・サイズ感はクリエイター、印刷品質・梱包・配送は運営です。印刷は運営の担当なので、そこでクリエイターの評価が下がるのは筋が通りません。

9. **注文ステータスは導出する。** 運営が手で更新するのではなく、印刷ジョブと発送記録から自動で決まります。二重管理で食い違うのを避けるためです。

10. **写真とスキャンデータは本人だけのもの。** `nui-scans` は非公開バケット、RLS は本人限定、写真は30日で失効（`photos_expire_at`）。画面にも同じことを書いてあります。

---

## 4. 次にやること（優先順）

### A. STEP1 のアップロードUI（いちばん大きい穴）

検証パイプラインは動くのに、ファイルを選んで Storage に保存し `validateAssetAction` を呼ぶ画面がありません。ここが繋がらないと出品フローが成立しないので、最優先です。

- ファイル選択 → `work-stl` バケットへ保存 → `validateAssetAction(assetId)`
- 検証中・検証NG・検証OK の3状態。Figma の「作品投稿 STEP1」と「STEP1（検証エラー）」がそのまま仕様です

### B. 作品一覧・検索・詳細

- ビューは `work_list_items` / 関数は `popular_works()` が用意済み
- 並べ替えは「お気に入りが多い順／新着／価格／評価」。人気順は `works_favorite_rank_idx` を使う（`Index Scan` になることは確認済み）

### C. 通知の画面実装

画面もDBもあるので、繋ぐだけです。`my_notifications` 相当のクエリ、`unread_notification_count()`、`mark_all_notifications_read()` を叩きます。

### D. マイぬい（手入力）

`nui_profiles` の CRUD と、メインのぬいによる一覧の絞り込み。画面は「マイぬい（一覧）」と「ぬいを登録（フォーム）」の2枚です。座高からサイズ区分（10/15/20cm）はトリガーが決めるので、UI 側で計算しないでください。

### E. うちの子で見る（アストラ連携）— 保留

実現できるか未確定なので、いまは本線から外してあります。Figma の ⑦ レーンにデザインだけ残してあり、`nui_scans` / `nui_assets` / `tryon_renders` も `0010` にありますが未使用です。

**相性判定はアストラに依存しません。** `nui_profiles` の採寸値と `work_variants.fit_*_mm` があれば `nui_fit_for_work()` はそのまま動くので、D まで作れば「このサイズはうちの子に合うか」は出せます。合成イメージだけが保留、という切り分けです。

### F. 決済（Stripe）と運営コンソール

`0006` の関数（`create_print_jobs_for_order` / `apply_qc_result` / `apply_shipment`）が揃っているので、UI と Webhook を繋ぐ作業になります。

### G. 既存作品の内寸を埋める

`variants_missing_fit_dims` ビューで未入力のバリアントが拾えます。クリエイターに一括で依頼するか、メッシュから自動推定するか未決です。自動推定を作るなら `src/lib/print/analyze.ts` に「くぼみ検出」を足す形になります。

---

## 5. 既知の宿題・不整合

- **Figma の数字とDBの計算がわずかに違う。** 10cm の代行費が Figma では ¥1,860 / 受取 ¥1,290、DB の計算では ¥1,863 / ¥1,287。バッチ数も Figma 3 に対して DB 2。実装時はDB側の値を正とし、モックの数字は後で直してください（`batch_count_override` で運用上の上書きは可能）。
- **アストラの連携方式が未確定。** アプリ間連携か Web からのカメラ起動か、生成をどこで走らせるか、課金をどうするか。
- **クリエイター申請の審査画面が実データに繋がっていない。** テーブルとトリガーはある。
- **合成の品質が出ない作品の扱いが未定。** 透明パーツや複雑な内部構造。
- 認定クリエイター（バッジによる格付け）は**削除済み**です。両Figmaファイル・README・SQL・ソースを全文検索して残骸ゼロを確認しています。`creator_applications` は出品権限のゲートなので別物として残しています。

---

## 6. Figma を触るときの注意（ハマったところ）

CLI 側でも Figma MCP を使うなら、これは知っておくと時間を無駄にしません。

- **`use_figma` は例外が出るとスクリプト全体がロールバックされる。** 途中まで書いた分も残りません。長いスクリプトほど、先に小さく試してから流したほうが速いです。
- **`layoutSizingHorizontal = "FILL"` は `appendChild` の後でないと落ちる。** 「auto-layout の子でない」というエラーが出たら、だいたいこれです。
- **テキストの折り返しは `textAutoResize="HEIGHT"` ＋ `FILL` をセットで。** 片方だけだと1行のまま切れます。
- **セクションの子の座標は相対。** セクションを `y=4800` に置いて子を `y=200` にすると、絶対座標は 5000 になります。ページ直下に置く矢印は絶対座標なので、混ぜると位置がずれます。
- **矢印の矢じりは `vectorNetwork` の終点だけに付ける。** `node.strokeCap = "ARROW_LINES"` は両端に付いてしまうので、`setVectorNetworkAsync` で最後の頂点だけ `ARROW_LINES` にしています。
- **レーン内の矢印はセクションの子にする。** ページ直下に置くと、セクション単位のスクリーンショットに写りません。
- **ノードを名前で探すときはスコープを絞る。** 一度、サイドバーの行を探したつもりでヘッダーのナビ項目を掴んで、間違った場所を書き換えました。
- **プロトタイプのリンク（`setReactionsAsync`）はセクション内のフレームにも張れる。** 遷移先は同じページの別のトップレベルフレームである必要があります（自分自身へのリンクは拒否されます）。

サイドバーの各行は `Nav→◯◯` という名前にしてあり、リンクはこの名前を見て一括で張っています。新しい行を足すときは同じ命名にしてください（名前が付いていない行はリンク対象から漏れます。実際それで3画面が「押しても何も起きない」状態になっていました）。

---

## 7. ファイルの場所

```
supabase/migrations/     0001〜0010
scripts/
  verify-0010.sql        0010 の動作確認（23項目）
  verify-pipeline.ts     検証パイプラインの出力をSQLにして流す
  analyze-file.ts        3MF/STL を単体で解析する
src/lib/print/           パーサとメッシュ解析
  zip.ts threemf.ts stl.ts mesh.ts analyze.ts estimate.ts index.ts
src/lib/works/           検証結果の永続化と Server Action
src/types/database.ts    手で維持している型定義
README.md                仕様（全38画面・データ設計・フロー・見積りの根拠）
HANDOFF.md               このファイル
```
