import { Card, CardContent } from "@/components/ui/card";

type Review = {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  creator_reply: string | null;
  creator_replied_at: string | null;
  created_at: string;
  profiles: { display_name: string; avatar_url: string | null } | null;
  review_images: { id: string; image_url: string; sort_order: number }[];
};

function Stars({ rating }: { rating: number }) {
  return <span aria-label={`評価 ${rating}/5`}>{"★".repeat(rating)}{"☆".repeat(5 - rating)}</span>;
}

export function ReviewList({ reviews }: { reviews: Review[] }) {
  if (reviews.length === 0) {
    return <p className="text-sm text-muted-foreground">まだレビューがありません。</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {reviews.map((review) => (
        <Card key={review.id}>
          <CardContent className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{review.profiles?.display_name ?? "購入者"}</span>
              <span className="text-sm text-amber-500">
                <Stars rating={review.rating} />
              </span>
            </div>
            {review.title && <p className="font-medium">{review.title}</p>}
            {review.body && <p className="whitespace-pre-wrap text-sm">{review.body}</p>}
            {review.review_images.length > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {[...review.review_images]
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((img) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={img.id}
                      src={img.image_url}
                      alt=""
                      className="aspect-square rounded-lg object-cover"
                    />
                  ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {new Date(review.created_at).toLocaleDateString("ja-JP")}
            </p>
            {review.creator_reply && (
              <div className="mt-1 rounded-lg bg-muted p-3 text-sm">
                <p className="mb-1 text-xs font-medium text-muted-foreground">クリエイターからの返信</p>
                <p className="whitespace-pre-wrap">{review.creator_reply}</p>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
