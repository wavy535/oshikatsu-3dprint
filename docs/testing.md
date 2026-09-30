# テスト方針と過不足の評価

現状は重要な業務・データ保持の回帰検証が充実している。一律にテスト数を増やす必要はない。ただし、**再実行できる試験環境とAIの実HTTP接続境界が不足しており、全体として必要十分とはまだ判断しない**。

この評価は2026-09-30のコード・設定の静的レビュー。今回テストは実行していない。過去の成功件数を現在の結果として扱わず、性能・生成品質・網羅率を推定しない。

## 現状と実行条件

Vitestは61ファイル（単体・DB・Worker統合を含む）、Playwrightは14ファイル。パラメータ化やループがあるため、ファイル数とケース数は異なる。カバレッジ設定・集計レポートはなく、行・分岐カバレッジ率は不明。リポジトリに `.github/workflows` はないため、PRごとの自動実行はこのリポジトリから確認できない。

| 検証 | コマンド | 前提・注意 |
| --- | --- | --- |
| 型・lint | `npm run typecheck` / `npm run lint` | 型生成が必要なら先に `npm run cf:types` |
| 単体・DB・workerd | `npm test` | Node 24。workerd試験は自身で一時環境を作るためローカルポートが必要 |
| DB関連だけの選択実行 | `npm run test:db` | `npm test` に含まれる8ファイルの選択。全DB関連ファイルを網羅するコマンドではない |
| R2転送・Geometry | `TEST_WORKER=true TEST_GEOMETRY=true npm test` | ローカルWeb・Geometry・設定が必要。通常実行ではR2の2ケースとGeometryの5ケースをskip |
| ビルド互換・後処理 | `npm run check:compat` / `npm run build` | buildは必要CSS生成を含む |
| ブラウザ | `npm run test:e2e` | 本番ビルドのローカルWeb・Geometryと開発fixtureが必要。自動起動設定なし |
| ゲスト専用 | `E2E_GUEST=true npm run test:e2e -- tests/e2e/guest.spec.ts` | ゲスト有効の隔離環境のみ。通常公開設定では実施しない |

通常の `npm test` と `npm run test:db` を連続して必須にすると同じ試験を二重実行する。DBだけを素早く確認する場合に後者を使い、全体確認では前者を使う。

ブラウザの既定URLは `http://localhost:3000`、変更は `E2E_BASE_URL`。CSS試験は `dist/client` を直接読むため、起動中のWebと同じビルド成果物が必要。起動方法は [README](../README.md)、本番ビルドは [Cloudflare手順](../infra/cloudflare/README.md) を参照する。

現状のブラウザ試験はローカルD1/R2の会員・注文・作品を変更する。普段使うDBをリセットして再試験しない。専用環境の用意と試験後の状態管理を改善するまでは、ローカル専用の試験データで実施する。

## 維持すべき検証

| 守る性質 | 主な根拠 | 判断 |
| --- | --- | --- |
| 他会員のデータを読めない・書けない、失敗後に権限が残らない | `d1-authorization`、`auth-session-queries`、`worker-database.integration` | SQLiteとworkerdの両方を残す。実行環境の差を検出するための重なり |
| 在庫を過剰販売しない、要求ID再実行で二重注文しない、途中失敗で巻き戻る | `d1-business`、`operations.integration` | 成功経路だけでなく競合・失敗注入を維持 |
| 金額・丸め・注文時のファイル参照が変わらない | `d1-business`、`d1-contracts`、`operations.integration` | 固定した旧DBの期待値と現在の状態遷移を残す |
| privateファイル、署名URLの操作・期限・サイズ境界 | `file-capability`、`asset-authorization`、`worker-files.integration` | 単体とHTTP/R2の両方が必要 |
| AI失敗・取消・手動編集時に元の設計を保持 | `design-composite`、`design-recovery`、`e2e/design-chat` | ドライバの分岐とブラウザ配線の検証を分けて維持 |
| 自由形状の制限、正体積・連結・寸法・部分編集・出力 | `design-freeform`、`design-program-edit`、`design-cli` | 固定図形・禁止構文・外部形式の再読込は有効 |
| CSS抽出で表示を変えない、検索・保存などを操作できる | `e2e/critical-css`、`home`、`notification-settings` | 完全CSSとの比較は採用した最適化に必要。一般的な見た目の正解判定とは別 |

上表のVitest名は `tests/<名前>.test.ts`、E2E名は `tests/e2e/<名前>.spec.ts` を指す。

SQL文字列・呼出回数を検査する試験も、一律に削除しない。例えば `auth-session-queries.test.ts` はDB往復を抑える決定を検証し、同時に会員分離・失効も確認している。単に関数の内部手順を再現する試験とは役割が異なる。

## 改善の優先順位

### 1. ブラウザ試験を繰り返せる環境にする

根拠: `tests/e2e/local-services.spec.ts` は注文で在庫を消費し、「在庫なし」以外のサイズを選ぶ回避を持つ。登録会員や投稿作品の全体cleanupはなく、公開試験のfinallyも掲載解除まで。`worker-files.integration.test.ts` はアップロードしたR2オブジェクトを削除しない。`playwright.config.ts` は1 worker・手動サーバー前提。

提案PR: 一時D1/R2状態とfixture、サービス起動・終了を試験単位で管理する。失敗時も片付け、既存開発DBには触れない。その後CIへ接続し、同じ初期条件で2回続けて成功することを受入条件にする。対象はPlaywright設定、E2E helpers、ローカル起動スクリプトとCI設定。カバレッジ率の増分は未測定だが、実行漏れ・状態依存を減らす。

### 2. AIの実HTTP経路と利用枠をつなぐ

根拠: `design-chat-route.test.ts` は認証・platform・利用枠・ハーネスをモックし、`e2e/design-chat.spec.ts` は `/api/design/chat` 自体を差し替える。`design-ai.test.ts` の利用枠試験はSQLiteのSQLを順次実行し、`reserveChat` のUTC日付計算・期限切れ削除やworkerd上の同時予約まで通していない。

提案PR: OpenAIの通信境界だけを模擬し、実WorkerのHTTP → セッション → D1予約 → ハーネスを通す統合試験を追加する。匿名・他originの要求では枠を消費せず、上限・並行要求・UTC日付切替・失敗時の枠保持を検証する。実API課金を通常試験に入れない。対象はAI route、quota、統合用fixture。全体カバレッジ増分は不明だが、未接続の認証・枠・応答の境界を埋める。

### 3. ブラウザ差と画像操作の検証を絞って追加する

根拠: Playwright設定はDesktop Chromeのみ。モバイル幅・touch指定は実Safari検証ではない。画像添付・日本語IME・取消はChromium E2Eにあり、Reactコンポーネント単独試験やTesting Libraryは未導入。

提案PR: まずWebKitで保存復元・画像添付・制作画面の代表操作を確認する。チャットのIME、テキスト貼付、添付上限、エラー復元などはTesting Libraryでrole/labelと利用者操作から検証する候補とし、同じ全経路E2Eを量産しない。外部応答はMSW等の通信境界で模擬する。対象はPlaywright projectsとチャット部品のテスト。分岐網羅は増えるが、率は計測後に判断する。実機AR・実寸は別の実機確認として残す。

### 4. 計測と品質評価を回帰試験から分ける

根拠: `e2e/design.spec.ts` のCPU4倍・20回編集は中央値/p95を添付するが性能閾値のassertはない。一般的な画像スナップショット比較もなく、CSS同等性と横幅検査が中心。実AI評価には旧モデルの証跡が混在し、既定 `gpt-6-astra` の固定ケース全体での比較は未確認。さらに `scripts/evaluate-design-ai.ts` は旧モデル2種だけを許可し、現行既定モデルを指定できない。

提案PR: 機能E2Eは操作成功に絞り、性能は専用計測へ分ける。VitestのV8カバレッジを先に採取し、認可・quota・修正停止の未到達分岐を確認する。ブラウザとの集計統合は運用上必要になった時点で追加する。評価CLIを現行モデル設定と一致させ、そのモデルに合う料金予算を確認する。実モデルは依頼外変更・見た目・修正成功率を固定ケースと明示した予算で別評価する。対象はテスト設定、計測・AI評価スクリプト。初回は基準値取得であり、カバレッジ向上や品質改善を先に約束しない。

## API・画面境界の確認表

- [x] 認証HTTPのセッション保持、未確認会員の登録、制作権限拒否を既存E2Eで検査する。
- [x] 注文作成→再読込と、別会員による注文閲覧拒否を既存E2Eで検査する。
- [x] 不正3MFからの復帰、投稿→公開→AR変換を既存E2Eで検査する。
- [x] AIの遅延応答・取消・不正提案、手動編集保持を模擬応答で検査する。
- [ ] AIのHTTP・実認証・D1利用枠・ハーネスを同じ試験で検査する。
- [ ] UTC日付切替、期限切れ枠削除、同時予約を `reserveChat` とworkerdで検査する。
- [ ] 対応ブラウザ間の画像入力・保存復元と実機ARの範囲を確定して確認する。

チェック済みは該当テストの存在を示す。今回実行して通過したという意味ではない。

## 増やさないもの・失敗の扱い

- すべての画面に同じ正常系E2Eを追加しない。業務判断はDB・純粋関数、配線と操作は代表E2Eで検証する。
- SQLiteとworkerd、コアとCLI、模擬AIと実WASMの重なりは異なる境界を守る。件数削減だけを理由に消さない。
- 100%の網羅率や全部品のスナップショットを目標にしない。生成UI部品の実装をそのままなぞる試験は優先しない。
- 失敗時は「仕様変更」「実装不具合」「試験の誤り」を根拠で区別する。期待値を機械的に更新せず、仕様判断が未確定な場合だけ確認する。

実プリント・強度・最薄肉厚・実機AR・画像再現品質は自動テストの成功だけでは判断できない。対応する保証を広げる前に、対象条件と合格基準を決める。
