import Link from "next/link";
import { requireAdmin } from "@/lib/auth/guards";
import { adminListReviews } from "@/features/reviews/queries";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { HideButton } from "./hide-button";

export default async function AdminReviewsPage() {
  await requireAdmin();
  const reviews = await adminListReviews();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">レビュー管理</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>作品</TableHead>
            <TableHead>投稿者</TableHead>
            <TableHead>評価</TableHead>
            <TableHead>本文</TableHead>
            <TableHead>状態</TableHead>
            <TableHead>操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {reviews.map((review) => (
            <TableRow key={review.id}>
              <TableCell>
                <Link href={`/products/${review.products?.slug}`} className="underline underline-offset-2">
                  {review.products?.title}
                </Link>
              </TableCell>
              <TableCell>{review.profiles?.display_name}</TableCell>
              <TableCell>{review.rating}</TableCell>
              <TableCell className="max-w-xs truncate">{review.body}</TableCell>
              <TableCell>
                <Badge variant={review.is_public ? "outline" : "secondary"}>
                  {review.is_public ? "公開中" : "非公開"}
                </Badge>
              </TableCell>
              <TableCell>{review.is_public && <HideButton reviewId={review.id} />}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
