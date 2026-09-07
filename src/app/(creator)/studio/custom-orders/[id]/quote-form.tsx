"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { submitQuote } from "@/features/custom-orders/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/** Figma ③ 見積り（2096:1389）をクリエイター側から作る */
export function QuoteForm({
  customOrderId,
  initial,
  commissionRate,
}: {
  customOrderId: string;
  initial: {
    price: number | null;
    filamentG: number | null;
    printMin: number | null;
    partCount: number | null;
    leadDays: number | null;
    spec: string;
    note: string;
  };
  commissionRate: number;
}) {
  const router = useRouter();
  const [price, setPrice] = useState(String(initial.price ?? ""));
  const [filamentG, setFilamentG] = useState(String(initial.filamentG ?? ""));
  const [printMin, setPrintMin] = useState(String(initial.printMin ?? ""));
  const [partCount, setPartCount] = useState(String(initial.partCount ?? ""));
  const [leadDays, setLeadDays] = useState(String(initial.leadDays ?? 14));
  const [spec, setSpec] = useState(initial.spec);
  const [note, setNote] = useState(initial.note);
  const [pending, setPending] = useState(false);

  const priceNum = Number(price) || 0;
  const revenue = priceNum - Math.round(priceNum * commissionRate);

  async function save() {
    setPending(true);
    const result = await submitQuote({
      customOrderId,
      quotePrice: priceNum,
      quoteFilamentG: filamentG === "" ? undefined : Number(filamentG),
      quotePrintMin: printMin === "" ? undefined : Number(printMin),
      quotePartCount: partCount === "" ? undefined : Number(partCount),
      quoteLeadDays: Number(leadDays) || 14,
      quoteSpec: spec || undefined,
      quoteNote: note || undefined,
    });
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("見積りを送りました");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4">
      <p className="text-sm font-bold text-ink">見積りを作る</p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">見積り金額（円）</span>
          <Input
            type="number"
            min={100}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">フィラメント量(g)</span>
          <Input
            type="number"
            min={0}
            value={filamentG}
            onChange={(e) => setFilamentG(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">造形時間(分)</span>
          <Input
            type="number"
            min={0}
            value={printMin}
            onChange={(e) => setPrintMin(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">パーツ数</span>
          <Input
            type="number"
            min={1}
            value={partCount}
            onChange={(e) => setPartCount(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">お届け目安(日)</span>
          <Input
            type="number"
            min={1}
            max={180}
            value={leadDays}
            onChange={(e) => setLeadDays(e.target.value)}
          />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-muted-foreground">
          確定仕様（購入者にそのまま見えます）
        </span>
        <Textarea
          rows={4}
          value={spec}
          onChange={(e) => setSpec(e.target.value)}
          placeholder="例: 15cm ぬい対応 / 台座＋背景パネル / PLA ホワイト＋ブラック / 6パーツ組立"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-muted-foreground">補足メモ（任意）</span>
        <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="lg" disabled={pending || priceNum < 100} onClick={save}>
          {pending ? "送信中..." : "見積りを送る"}
        </Button>
        <p className="num text-[11.5px] text-muted-foreground">
          受取額の目安 ¥{revenue.toLocaleString()}（手数料
          {Math.round(commissionRate * 100)}%）
        </p>
      </div>
    </div>
  );
}
