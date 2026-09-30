# 設計サンプルとAI評価

`/create` の「設計を開く・ファイルに保存」から設計JSONを読み込む。各サンプルの作成方法と用途は以下のとおり。

| 資料 | 用途 |
| --- | --- |
| [家具付きのおうち](furnished-house.oshinest.json) | 窓・家具・出力の固定サンプル |
| [装飾椅子](decorated-chair.oshinest.json) / [湾曲装甲](curved-armor.oshinest.json) | 手書きの設計。形状生成と出力のテスト用 |
| [実AIサンプル](AI-SAMPLES.md) | 旧モデルによる生成・修正の結果と制約 |
| [装飾フレーム](ORNAMENT-MODELING.md) | 実AIの生成・部分編集、モデル切替前後の結果 |
| [基本編集のモデル比較](../evaluations/design-ai-model-comparison.json) | 初期モデル比較の固定結果 |

`passed` は各評価スクリプトが定義する形状検証・保存・出力の成功であり、依頼との見た目の一致や製造承認ではない。実AIで成功した記録をE2Eで再生しても、新規生成の成功率を測ったことにはならない。

現行モデルは [AIチャット](../design-ai-chat.md) を参照。結果JSON、設計、出力ファイルは再現用に残す。
