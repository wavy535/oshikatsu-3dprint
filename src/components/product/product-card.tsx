import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export type ProductCardData = {
  id: string;
  slug: string;
  title: string;
  base_price: number;
  review_count: number;
  review_avg: number;
  favorite_count: number;
  creator_handle: string;
  creator_display_name: string;
  image_url: string | null;
};

export function ProductCard({ product }: { product: ProductCardData }) {
  return (
    <Link href={`/products/${product.slug}`}>
      <Card className="overflow-hidden py-0 transition-shadow hover:shadow-md">
        <div className="aspect-square w-full bg-muted">
          {product.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.image_url}
              alt={product.title}
              className="size-full object-cover"
            />
          )}
        </div>
        <CardContent className="flex flex-col gap-1 p-3">
          <p className="line-clamp-2 text-sm font-medium">{product.title}</p>
          <p className="text-xs text-muted-foreground">{product.creator_display_name}</p>
          <div className="flex items-center justify-between pt-1">
            <span className="text-sm font-semibold">
              ¥{product.base_price.toLocaleString()}
            </span>
            {product.review_count > 0 && (
              <Badge variant="outline">
                ★{product.review_avg.toFixed(1)} ({product.review_count})
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
