"use client";

import { useActionState, useState } from "react";
import { Star } from "lucide-react";

import { submitReviewAction, type ReviewActionState } from "@/lib/orders/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const initialState: ReviewActionState = { error: null };

function Stars({
  name,
  label,
  required,
  hint,
}: {
  name: string;
  label: string;
  required?: boolean;
  hint?: string;
}) {
  const [value, setValue] = useState(0);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="w-36 text-[12px] text-ink">
          {label}
          {required && <span className="ml-1 text-[10px] text-danger">必須</span>}
        </span>
        <input type="hidden" name={name} value={value || ""} />
        <div className="flex gap-0.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`${label} ${n}点`}
              aria-pressed={value === n}
              onClick={() => setValue(n)}
              className="p-0.5"
            >
              <Star
                className={cn(
                  "size-5 transition-colors",
                  n <= value ? "fill-star text-star" : "text-line"
                )}
                aria-hidden
              />
            </button>
          ))}
        </div>
      </div>
      {hint && <p className="pl-36 text-[10.5px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * Figma ①購入フロー「受け取り評価・レビュー投稿 61:153」。
 * 上段がクリエイターあて（必須）、下段が運営あて（任意）。
 * 運営あての評価はクリエイターの星に反映されない。
 */
export function ReviewForm({ orderItemId, workTitle }: { orderItemId: string; workTitle: string }) {
  const [state, formAction, pending] = useActionState(submitReviewAction, initialState);

  if (state.ok) {
    return (
      <p className="rounded-lg bg-ok-bg px-3 py-2 text-[12px] text-ok">
        評価を投稿しました。ありがとうございます。
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-xl border border-line bg-white p-4">
      <input type="hidden" name="orderItemId" value={orderItemId} />

      <div className="flex flex-col gap-3">
        <p className="text-[12.5px] font-semibold text-ink">
          {workTitle} はいかがでしたか？
        </p>
        <Stars name="rating" label="総合評価" required />
        <Stars name="designRating" label="デザイン・完成度" required />
        <Stars name="accuracyRating" label="説明との一致" required />
        <Stars name="sizeFitRating" label="サイズ感" required />
      </div>

      <div className="flex flex-col gap-3 rounded-lg bg-ground/60 p-3">
        <p className="text-[12px] font-semibold text-ink">印刷・梱包・配送（運営あて・任意）</p>
        <p className="text-[10.5px] text-muted-foreground">
          この評価はクリエイターの評価には反映されません。
        </p>
        <Stars name="printQualityRating" label="印刷の品質" />
        <Stars name="packagingRating" label="梱包" />
        <Stars name="shippingRating" label="発送の速さ" />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="comment" className="text-[12px] text-ink">
          コメント（任意）
        </label>
        <textarea
          id="comment"
          name="comment"
          rows={4}
          maxLength={2000}
          placeholder="サイズ感や飾ったときの様子など"
          className="rounded-lg border border-line bg-white px-3 py-2 text-[12.5px] text-ink outline-none focus:border-brand"
        />
      </div>

      <label className="flex items-center gap-2 text-[12px] text-ink">
        <input type="checkbox" name="isAnonymous" className="size-4 accent-brand" />
        名前を出さずに投稿する
      </label>

      {state.error && <p className="text-[12px] text-danger">{state.error}</p>}

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "投稿しています..." : "評価を投稿する"}
      </Button>
    </form>
  );
}
