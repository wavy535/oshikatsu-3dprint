"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Star } from "lucide-react";
import {
  createReview,
  deleteReview,
  updateReview,
  upsertServiceReview,
} from "@/features/reviews/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Review = {
  id: string;
  rating: number;
  rating_design: number | null;
  rating_accuracy: number | null;
  rating_size: number | null;
  title: string | null;
  body: string | null;
  created_at: string;
} | null;

type Item = {
  id: string;
  product_title: string;
  review: Review;
  editable: boolean;
};

export type ServiceReview = {
  rating_print: number;
  rating_packing: number;
  rating_delivery: number;
  comment: string | null;
} | null;

function StarInput({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-32 shrink-0 text-[12px] text-ink">{label}</span>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-label={`${label} ${n}点`}
            className="p-0.5"
          >
            <Star
              className={cn(
                "size-4.5",
                n <= value ? "fill-star text-star" : "text-line"
              )}
              aria-hidden
            />
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Figma ①購入フロー「受け取り評価・レビュー投稿 61:153」。
 * ①クリエイターあて（作品ごと）と ②運営あて（注文ごと・任意）の 2 段。
 * ②はクリエイターの評価には反映されない。
 */
export function ReviewSection({
  orderId,
  items,
  serviceReview,
}: {
  orderId: string;
  items: Item[];
  serviceReview: ServiceReview;
}) {
  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4">
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-bold text-ink">クリエイターへの総合評価</p>
          <p className="text-[11px] text-muted-foreground">
            作品そのものへの評価です。作品ページの星に反映されます。
          </p>
        </div>
        {items.map((item) => (
          <ReviewRow key={item.id} item={item} />
        ))}
      </div>

      <ServiceReviewForm orderId={orderId} initial={serviceReview} />
    </div>
  );
}

function ReviewRow({ item }: { item: Item }) {
  const [editing, setEditing] = useState(!item.review);
  const [rating, setRating] = useState(item.review?.rating ?? 5);
  const [design, setDesign] = useState(item.review?.rating_design ?? 5);
  const [accuracy, setAccuracy] = useState(item.review?.rating_accuracy ?? 5);
  const [size, setSize] = useState(item.review?.rating_size ?? 5);
  const [title, setTitle] = useState(item.review?.title ?? "");
  const [body, setBody] = useState(item.review?.body ?? "");
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      const payload = {
        rating,
        ratingDesign: design,
        ratingAccuracy: accuracy,
        ratingSize: size,
        title,
        body,
      };
      const result = item.review
        ? await updateReview({ reviewId: item.review.id, ...payload })
        : await createReview({ orderItemId: item.id, ...payload });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("レビューを保存しました");
      setEditing(false);
    });
  }

  function handleDelete() {
    if (!item.review) return;
    if (!window.confirm("レビューを削除しますか？")) return;
    startTransition(async () => {
      const result = await deleteReview(item.review!.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("削除しました");
    });
  }

  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3 first:border-t-0 first:pt-0">
      <p className="text-[13px] font-semibold text-ink">{item.product_title}</p>
      {/* 保存直後は setEditing(false) がサーバー再取得より先に反映されうるため、
          item.review が未反映の間はフォームを出し続ける（null 参照でのクラッシュ防止） */}
      {editing || !item.review ? (
        <div className="flex flex-col gap-2">
          <StarInput label="総合" value={rating} onChange={setRating} />
          <StarInput label="デザイン・完成度" value={design} onChange={setDesign} />
          <StarInput label="説明との一致" value={accuracy} onChange={setAccuracy} />
          <StarInput label="サイズ感" value={size} onChange={setSize} />
          <Input
            placeholder="タイトル（任意）"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={60}
          />
          <Textarea
            rows={3}
            placeholder="レビュー本文（任意）"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={2000}
          />
          <div className="flex gap-2">
            <Button size="sm" disabled={isPending} onClick={handleSave}>
              {item.review ? "更新する" : "投稿する"}
            </Button>
            {item.review && (
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                キャンセル
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1 text-[13px]">
          <span className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <Star
                key={n}
                className={cn(
                  "size-3.5",
                  n <= item.review!.rating ? "fill-star text-star" : "text-line"
                )}
                aria-hidden
              />
            ))}
          </span>
          {item.review.title && (
            <p className="font-medium text-ink">{item.review.title}</p>
          )}
          {item.review.body && (
            <p className="whitespace-pre-wrap text-muted-foreground">{item.review.body}</p>
          )}
          {item.editable && (
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                編集
              </Button>
              <Button size="sm" variant="ghost" disabled={isPending} onClick={handleDelete}>
                削除
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ServiceReviewForm({
  orderId,
  initial,
}: {
  orderId: string;
  initial: ServiceReview;
}) {
  const [print, setPrint] = useState(initial?.rating_print ?? 5);
  const [packing, setPacking] = useState(initial?.rating_packing ?? 5);
  const [delivery, setDelivery] = useState(initial?.rating_delivery ?? 5);
  const [comment, setComment] = useState(initial?.comment ?? "");
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4">
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-bold text-ink">印刷・梱包・配送（運営あて・任意）</p>
        <p className="text-[11px] text-muted-foreground">
          こちらはクリエイターの評価には反映されません。運営の品質改善に使います。
        </p>
      </div>
      <StarInput label="印刷の仕上がり" value={print} onChange={setPrint} />
      <StarInput label="梱包" value={packing} onChange={setPacking} />
      <StarInput label="配送" value={delivery} onChange={setDelivery} />
      <Textarea
        rows={3}
        placeholder="気づいた点があれば書いてください（任意）"
        value={comment}
        maxLength={2000}
        onChange={(e) => setComment(e.target.value)}
      />
      <Button
        size="sm"
        className="self-start"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const result = await upsertServiceReview({
              orderId,
              ratingPrint: print,
              ratingPacking: packing,
              ratingDelivery: delivery,
              comment,
            });
            if (!result.ok) {
              toast.error(result.error);
              return;
            }
            toast.success("運営あての評価を送信しました");
          })
        }
      >
        {initial ? "更新する" : "送信する"}
      </Button>
    </div>
  );
}
