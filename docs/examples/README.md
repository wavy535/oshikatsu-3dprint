# 設計サンプルとAI評価

`/create` の「設計を開く・ファイルに保存」から設計JSONを読み込む。固定サンプル・実AIの出力・実モデルの品質評価を区別する。

| 資料 | 用途 |
| --- | --- |
| [家具付きのおうち](furnished-house.oshinest.json) | 窓・家具・出力の固定サンプル |
| [装飾椅子](decorated-chair.oshinest.json) / [湾曲装甲](curved-armor.oshinest.json) | 手書きの実行系検証データ。AI品質の証拠ではない |
| [実AIサンプル](AI-SAMPLES.md) | 旧モデルによる生成・修正の結果と制約 |
| [装飾フレーム](ORNAMENT-MODELING.md) | 実AIの生成・部分編集、モデル切替前後の証跡 |
| [基本編集のモデル比較](../evaluations/design-ai-model-comparison.json) | 初期モデル比較の固定結果 |

`passed` は各評価スクリプトが定義する形状検証・保存・出力の成功であり、依頼との見た目の一致や製造承認ではない。実AIで成功した記録をE2Eで再生しても、新規生成の成功率を測ったことにはならない。

現行モデル設定は [AIチャット](../design-ai-chat.md) を参照。結果JSON、設計、出力ファイルは比較・回帰用に保持し、過去の評価を新しいモデルの実績に書き換えない。
