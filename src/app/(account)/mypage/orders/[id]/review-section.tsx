"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createReview, deleteReview, updateReview } from "@/features/reviews/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type Review = {
  id: string;
  rating: number;
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

export function ReviewSection({ items }: { items: Item[] }) {
  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>レビュー</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {items.map((item) => (
          <ReviewRow key={item.id} item={item} />
        ))}
      </CardContent>
    </Card>
  );
}

function ReviewRow({ item }: { item: Item }) {
  const [editing, setEditing] = useState(!item.review);
  const [rating, setRating] = useState(item.review?.rating ?? 5);
  const [title, setTitle] = useState(item.review?.title ?? "");
  const [body, setBody] = useState(item.review?.body ?? "");
  const [isPending, startTransition] = useTransition();
  const editable = item.editable;

  function handleSave() {
    startTransition(async () => {
      const result = item.review
        ? await updateReview({ reviewId: item.review.id, rating, title, body })
        : await createReview({ orderItemId: item.id, rating, title, body });
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
    <div className="flex flex-col gap-2 border-t pt-3 first:border-t-0 first:pt-0">
      <p className="text-sm font-medium">{item.product_title}</p>
      {/* 保存直後は setEditing(false) がサーバー再取得より先に反映されうるため、
          item.review が未反映の間はフォームを出し続ける（null 参照でのクラッシュ防止） */}
      {editing || !item.review ? (
        <div className="flex flex-col gap-2">
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                className="text-lg text-amber-500"
                aria-label={`${n}点`}
              >
                {n <= rating ? "★" : "☆"}
              </button>
            ))}
          </div>
          <input
            className="rounded-md border px-3 py-1.5 text-sm"
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
        <div className="flex flex-col gap-1 text-sm">
          <span className="text-amber-500">{"★".repeat(item.review.rating)}{"☆".repeat(5 - item.review.rating)}</span>
          {item.review.title && <p className="font-medium">{item.review.title}</p>}
          {item.review.body && <p className="whitespace-pre-wrap text-muted-foreground">{item.review.body}</p>}
          {editable && (
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
