/** Diagnostics stay in the repair pipeline; these messages are safe to show. */
export const RECOVERY_MESSAGE = "今回は形を完成できませんでした。現在のモデルは変更していません。もう一度試すか、作り方を相談できます。";
export class RecoveryExhausted extends Error {
  readonly diagnostic: string;
  constructor(diagnostic: string) { super(RECOVERY_MESSAGE); this.diagnostic = diagnostic; }
}
export function repairHint(message: string): string {
  if (/引数|script-validation|モデリングコード/.test(message)) return "コードの該当行とAPI仕様を確認し、その原因だけを修正してください。unionは2〜16引数、他のAPIの引数数は仕様どおりです。map/reduce/関数定義は使えません。";
  if (/分離/.test(message)) return "装飾と本体を体積が重なる接続に直してください。装飾を消して通過させてはいけません。";
  if (/size|実寸|造形範囲/.test(message)) return "指定寸法と実際の外寸を一致させてください。依頼された寸法やプリンタ上限を勝手に変更しないでください。";
  return "元の依頼と未変更の設計を維持して、診断された原因を修正してください。装飾の削除や別の形への置換が必要ならchanges=[]で相談してください。";
}
