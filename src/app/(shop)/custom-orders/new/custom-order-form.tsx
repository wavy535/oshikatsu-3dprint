"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { createCustomOrder } from "@/features/custom-orders/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/** Figma ③ オーダーメイド相談フォーム（48:900） */
export function CustomOrderForm({
  productId,
  nuiSizes,
}: {
  productId: string;
  nuiSizes: { id: number; label: string }[];
}) {
  const router = useRouter();
  const [nuiSizeId, setNuiSizeId] = useState<number | null>(null);
  const [colorNote, setColorNote] = useState("");
  const [finishNote, setFinishNote] = useState("");
  const [requestNote, setRequestNote] = useState("");
  const [desiredDate, setDesiredDate] = useState("");
  const [pending, setPending] = useState(false);

  async function submit() {
    setPending(true);
    const result = await createCustomOrder({
      productId,
      nuiSizeId: nuiSizeId ?? undefined,
      colorNote: colorNote || undefined,
      finishNote: finishNote || undefined,
      requestNote,
      desiredDate: desiredDate || undefined,
    });
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("相談を送信しました");
    router.push(`/custom-orders/${result.data.id}`);
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5">
      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] font-semibold text-ink">サイズの希望</span>
        <div className="flex flex-wrap gap-1.5">
          {nuiSizes.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={nuiSizeId === s.id}
              onClick={() => setNuiSizeId(nuiSizeId === s.id ? null : s.id)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-[12px]",
                nuiSizeId === s.id
                  ? "border-brand bg-brand-soft text-accent-foreground"
                  : "border-line bg-white text-ink"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-muted-foreground">
          一覧にない中間サイズは、下の希望欄に書いてください。
        </span>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[12px] font-semibold text-ink">カラーの希望</span>
        <Input
          value={colorNote}
          maxLength={500}
          placeholder="例: 白ベースに黒のアクセント、マット仕上げ"
          onChange={(e) => setColorNote(e.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[12px] font-semibold text-ink">加工の希望</span>
        <Input
          value={finishNote}
          maxLength={500}
          placeholder="例: 表面をやすりがけして塗装したい"
          onChange={(e) => setFinishNote(e.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[12px] font-semibold text-ink">
          相談内容 <span className="text-danger">*</span>
        </span>
        <Textarea
          rows={6}
          value={requestNote}
          maxLength={2000}
          placeholder="どんなものを作ってほしいかを具体的に書いてください。参考にしたい作品や寸法があれば添えてください。"
          onChange={(e) => setRequestNote(e.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[12px] font-semibold text-ink">希望納期（任意）</span>
        <Input
          type="date"
          value={desiredDate}
          className="w-48"
          onChange={(e) => setDesiredDate(e.target.value)}
        />
      </label>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          size="lg"
          disabled={pending || requestNote.trim().length === 0}
          onClick={submit}
        >
          {pending ? "送信中..." : "相談を送信する"}
        </Button>
        <p className="text-[11px] text-muted-foreground">
          送信するとメッセージとしてクリエイターに届き、あとから見積りが返ってきます。
        </p>
      </div>
    </div>
  );
}
