"use client";

import { useActionState, useMemo, useState } from "react";
import { FileText, XCircle } from "lucide-react";

import { createQuoteAction, declineRequestAction, type CustomOrderActionState } from "@/lib/custom-orders/actions";
import { Button } from "@/components/ui/button";

const initial: CustomOrderActionState = { error: null };
const FIELD =
  "w-full rounded-lg border border-line bg-white px-3 py-2 text-[12px] text-ink outline-none focus:border-brand";

type Rule = {
  material_yen_per_gram: number;
  machine_yen_per_hour: number;
  handling_per_part_yen: number;
  shipping_fee_jpy: number;
  platform_fee_rate: number;
} | null;

const yen = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`;

/**
 * クリエイターが見積りを書く。印刷代行費・受取額は料金表の式で入力に合わせてその場で出す
 * （確定値は保存時に DB の calc_print_fee が出す。ここは目安）。
 */
export function QuoteForm({ requestId, baseWorkId, rule }: { requestId: string; baseWorkId?: string; rule: Rule }) {
  const [state, action, pending] = useActionState(createQuoteAction, initial);
  const [declineState, decline, declining] = useActionState(declineRequestAction, initial);
  const [price, setPrice] = useState(3000);
  const [grams, setGrams] = useState(100);
  const [hours, setHours] = useState(5);
  const [parts, setParts] = useState(1);

  const est = useMemo(() => {
    if (!rule) return null;
    const printFee =
      Math.round(grams * Number(rule.material_yen_per_gram)) +
      Math.round(hours * Number(rule.machine_yen_per_hour)) +
      rule.handling_per_part_yen * Math.max(parts, 1);
    const payout = price - Math.round(price * Number(rule.platform_fee_rate));
    return { printFee, total: price + printFee + rule.shipping_fee_jpy, payout };
  }, [rule, price, grams, hours, parts]);

  return (
    <div className="flex flex-col gap-3">
      <form action={action} className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4">
        <input type="hidden" name="requestId" value={requestId} />
        {baseWorkId && <input type="hidden" name="baseWorkId" value={baseWorkId} />}
        <h2 className="text-[13px] font-bold text-ink">見積りを書く</h2>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold text-ink">確定する仕様（項目 / 確定内容 / 相談時のご希望）</span>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="grid grid-cols-[1fr_1.6fr_1.2fr] gap-1.5">
              <input name={`spec_item_${i}`} placeholder={i === 0 ? "サイズ" : i === 1 ? "カラー" : ""} className={FIELD} />
              <input name={`spec_decided_${i}`} placeholder={i === 0 ? "13cm（カスタム）" : i === 1 ? "PLA ラベンダー" : ""} className={FIELD} />
              <input name={`spec_requested_${i}`} placeholder={i === 0 ? "13cmのぬい用" : ""} className={FIELD} />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <label className="flex flex-col gap-1">
            <span className="text-[10.5px] text-muted-foreground">作品代金（円）</span>
            <input name="priceJpy" type="number" min={100} step={100} value={price} onChange={(e) => setPrice(Number(e.target.value))} required className={FIELD} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10.5px] text-muted-foreground">推定フィラメント（g）</span>
            <input name="grams" type="number" min={1} step={1} value={grams} onChange={(e) => setGrams(Number(e.target.value))} required className={FIELD} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10.5px] text-muted-foreground">推定造形時間（h）</span>
            <input name="hours" type="number" min={0.1} step={0.1} value={hours} onChange={(e) => setHours(Number(e.target.value))} required className={FIELD} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10.5px] text-muted-foreground">パーツ数</span>
            <input name="parts" type="number" min={1} step={1} value={parts} onChange={(e) => setParts(Number(e.target.value))} required className={FIELD} />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <label className="flex flex-col gap-1">
            <span className="text-[10.5px] text-muted-foreground">納期（承認から日数）</span>
            <input name="leadDays" type="number" min={1} max={90} defaultValue={10} className={FIELD} />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-1">
            <span className="text-[10.5px] text-muted-foreground">備考（購入者に見えます）</span>
            <input name="note" maxLength={1000} placeholder="ラベンダーは在庫から引き当てます" className={FIELD} />
          </label>
        </div>

        {est && (
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-ground px-3 py-2.5 text-[11px] sm:grid-cols-4">
            <span className="flex flex-col"><span className="text-muted-foreground">印刷代行費（目安）</span><span className="num font-semibold text-ink">{yen(est.printFee)}</span></span>
            <span className="flex flex-col"><span className="text-muted-foreground">送料</span><span className="num font-semibold text-ink">{yen(rule!.shipping_fee_jpy)}</span></span>
            <span className="flex flex-col"><span className="text-muted-foreground">購入者の支払い</span><span className="num font-semibold text-ink">{yen(est.total)}</span></span>
            <span className="flex flex-col"><span className="text-muted-foreground">あなたの受取（見込み）</span><span className="num font-semibold text-brand">{yen(est.payout)}</span></span>
          </div>
        )}

        <Button type="submit" disabled={pending} className="w-full">
          <FileText className="size-3.5" aria-hidden />
          見積りを提示する（有効期限 7日）
        </Button>
        {state.error && <p className="text-[11px] text-danger">{state.error}</p>}
        {state.message && <p className="text-[11px] text-ok">{state.message}</p>}
      </form>

      <form action={decline} className="flex items-center justify-end gap-2">
        <input type="hidden" name="requestId" value={requestId} />
        <button type="submit" disabled={declining} className="flex items-center gap-1 text-[11px] text-danger hover:underline disabled:opacity-50">
          <XCircle className="size-3.5" aria-hidden />
          この相談をお断りする
        </button>
        {declineState.error && <span className="text-[11px] text-danger">{declineState.error}</span>}
        {declineState.message && <span className="text-[11px] text-ok">{declineState.message}</span>}
      </form>
    </div>
  );
}
