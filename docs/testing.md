# テスト

認可、在庫競合、更新失敗時の巻き戻しにはテストがある。優先して補いたいのは、繰り返し実行できるE2E環境と、AIのAPIを認証から利用枠の更新まで通す統合テスト。

2026-09-30にコードと設定を確認した。テストは実行していない。Vitestは61ファイル、Playwrightは14ファイル。カバレッジは未計測で、リポジトリにGitHub Actionsのワークフローはない。

## 実行方法

| 対象 | コマンド | 必要な環境 |
| --- | --- | --- |
| 型・lint | `npm run typecheck` / `npm run lint` | 必要に応じて先に `npm run cf:types` |
| 単体・DB・workerd | `npm test` | Node 24。workerd試験は一時環境を起動するためローカルポートが必要 |
| DB関連8ファイル | `npm run test:db` | `npm test` の部分集合。全DB関連ファイルを含むわけではない |
| R2転送・Geometry | `TEST_WORKER=true TEST_GEOMETRY=true npm test` | ローカルWebとGeometry。通常実行では計7ケースをskip |
| ビルド | `npm run check:compat` / `npm run build` | buildは必要CSSの生成を含む |
| ブラウザ | `npm run test:e2e` | 本番ビルドのローカルWeb、Geometry、開発用データ。サーバーは手動で起動 |
| ゲスト専用 | `E2E_GUEST=true npm run test:e2e -- tests/e2e/guest.spec.ts` | ゲストを有効にした隔離環境 |

`npm test` を実行した後に `npm run test:db` を重ねる必要はない。

ブラウザの接続先は `http://localhost:3000`。変更する場合は `E2E_BASE_URL` を指定する。CSS試験は `dist/client` を読むため、起動中のWebと同じビルド成果物を使う。起動手順は [README](../README.md)、本番ビルドは [Cloudflare手順](../infra/cloudflare/README.md) を参照。

E2Eは会員・注文・作品をD1/R2へ書き込む。試験専用のローカルデータを使い、普段使う開発DBをリセットしない。

## 既存テスト

| 検査する動作 | テスト |
| --- | --- |
| 他会員のデータを拒否し、失敗後に要求元のIDをDBに残さない | `d1-authorization`、`auth-session-queries`、`worker-database.integration` |
| 在庫超過・二重注文を防ぎ、途中失敗で更新を戻す | `d1-business`、`operations.integration` |
| 金額の丸めと注文時のファイル参照を保持する | `d1-business`、`d1-contracts`、`operations.integration` |
| 非公開ファイルへのアクセスと署名URLの操作・期限・サイズを制限する | `file-capability`、`asset-authorization`、`worker-files.integration` |
| AI失敗・取消・手動編集後に古い案を適用しない | `design-composite`、`design-recovery`、`e2e/design-chat` |
| 生成コードを制限し、形状の体積・連結・寸法と部分編集・出力を検査する | `design-freeform`、`design-program-edit`、`design-cli` |
| CSS抽出前後の表示を比較し、検索・通知設定の操作を確認する | `e2e/critical-css`、`e2e/home`、`e2e/notification-settings` |

Vitestは `tests/<名前>.test.ts`、E2Eは `tests/e2e/<名前>.spec.ts`。既存E2Eには、会員登録とセッション保持、権限のない会員の拒否、注文後の再読込、不正3MFからの復帰、投稿からAR表示までの操作もある。

SQLiteとworkerdの試験は両方残す。前者では業務処理を細かく調べ、後者ではCloudflareの実行環境で同じSQLが動くかを調べる。コアとCLI、編集処理とブラウザ操作の試験も、それぞれ呼び出し方が違うため必要。

`auth-session-queries.test.ts` のSQL・呼出回数の検査は、DB往復を減らした変更を確認するために残す。会員の分離とセッション失効も同じ試験で確認している。

## 改善案

### E2E環境

`tests/e2e/local-services.spec.ts` は注文で在庫を消費し、次回は売り切れていないサイズを選ぶ。作成した会員や作品は残り、公開試験の終了処理も掲載解除まで。`worker-files.integration.test.ts` もアップロードしたファイルをR2から削除しない。

試験ごとに一時D1/R2と初期データを用意し、失敗時も削除する仕組みが必要。Playwrightの設定と起動スクリプトを変更し、同じ初期条件で2回続けて通ることを確認してからCIへ組み込む。

### AIのAPIと利用枠

`design-chat-route.test.ts` は認証、DB接続、利用枠、モデル呼出をモックしている。ブラウザ試験も `/api/design/chat` の応答を差し替えるため、これらの処理を一緒に通す試験がない。

OpenAIの応答だけを模擬し、実WorkerへHTTP要求を送る試験を追加したい。セッション確認からD1の利用枠予約まで通し、匿名・別originの要求で枠を消費しないこと、上限超過の拒否、失敗時の枠保持を確認する。

`design-ai.test.ts` は利用枠のSQLをSQLiteで順次実行している。`reserveChat` のUTC日付切替、期限切れ記録の削除、workerdでの同時予約も追加対象。

### ブラウザとチャット操作

現在の設定はDesktop Chromeのみ。モバイル幅やtouchの指定はあるが、Safariでは確認していない。まずWebKitで保存復元・画像添付・制作画面の代表操作を試す。

日本語IME、テキスト貼付、添付上限、エラー後の入力復元は、Testing Libraryによる部品単位の試験も候補。roleやlabelで操作し、HTTP応答はMSWなどで差し替える。全画面のE2Eを増やす前に、既存E2Eとの重複を確認する。

### 性能と実モデル評価

`e2e/design.spec.ts` はCPU4倍減速で20回編集し、中央値とp95を記録するが、遅くなっても失敗しない。性能は専用の計測へ分ける。画面の確認もCSS抽出前後の比較と横幅検査が中心で、一般的な画像スナップショット比較はない。

`scripts/evaluate-design-ai.ts` は旧モデル2種しか指定できない。現行の `gpt-6-astra` に対応させ、料金予算を決めて固定ケースを評価する必要がある。依頼外の変更、見た目、修正の成功を調べる。過去の少数例から現行モデルの成功率は分からない。

VitestのV8カバレッジを採取し、認可・利用枠・修正停止で通っていない分岐も調べる。ブラウザとの集計統合は必要になった時点で追加する。

## 自動テストで確認できないこと

実プリント、強度、最薄肉厚、実機ARの寸法、参考画像との見た目の一致は別途確認が必要。試験前にプリンタや対象機種、合格基準を決める。

テストが失敗したら、仕様・実装・期待値のどれが誤っているかを調べる。通すためだけに期待値を書き換えない。
