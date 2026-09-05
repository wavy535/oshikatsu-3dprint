import Link from "next/link";
import { requireCreator } from "@/lib/auth/guards";
import { listCreatorReviews } from "@/features/reviews/queries";
import { Card, CardContent } from "@/components/ui/card";
import { ReplyForm } from "./reply-form";

function Stars({ rating }: { rating: number }) {
  return <span className="text-amber-500">{"★".repeat(rating)}{"☆".repeat(5 - rating)}</span>;
}

export default async function StudioReviewsPage() {
  const { user } = await requireCreator();
  const reviews = await listCreatorReviews(user.id);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">レビュー</h1>
      {reviews.length === 0 ? (
        <p className="text-sm text-muted-foreground">まだレビューがありません。</p>
      ) : (
        <div className="flex flex-col gap-4">
          {reviews.map((review) => (
            <Card key={review.id}>
              <CardContent className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Link
                    href={`/products/${review.products?.slug}`}
                    className="text-sm font-medium underline underline-offset-2"
                  >
                    {review.products?.title}
                  </Link>
                  <Stars rating={review.rating} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {review.profiles?.display_name} ・ {new Date(review.created_at).toLocaleDateString("ja-JP")}
                  {!review.is_public && "（非公開）"}
                </p>
                {review.title && <p className="font-medium">{review.title}</p>}
                {review.body && <p className="whitespace-pre-wrap text-sm">{review.body}</p>}
                {review.creator_reply && (
                  <div className="rounded-lg bg-muted p-3 text-sm">
                    <p className="mb-1 text-xs font-medium text-muted-foreground">あなたの返信</p>
                    <p className="whitespace-pre-wrap">{review.creator_reply}</p>
                  </div>
                )}
                <ReplyForm reviewId={review.id} existingReply={review.creator_reply} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
