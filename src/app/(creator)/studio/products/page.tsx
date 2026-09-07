import Link from "next/link";
import { Plus } from "lucide-react";
import { requireCreator } from "@/lib/auth/guards";
import { listMyProducts } from "@/features/products/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArchiveButton } from "./archive-button";

export const metadata = { title: "作品管理" };

const STATUS_LABEL: Record<string, string> = {
  draft: "下書き",
  in_review: "審査中",
  published: "公開中",
  rejected: "却下",
  archived: "販売停止",
};

export default async function StudioProductsPage() {
  const { user } = await requireCreator();
  const products = await listMyProducts(user.id);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-bold text-ink">作品管理</h1>
        <span className="num text-xs text-muted-foreground">{products.length}件</span>
        <span className="flex-1" />
        <Button render={<Link href="/studio/products/new" />}>
          <Plus />
          新しい作品を投稿
        </Button>
      </div>

      {products.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-white py-14">
          <p className="text-sm text-muted-foreground">まだ作品がありません</p>
          <Button render={<Link href="/studio/products/new" />} variant="outline">
            3Dデータをアップロードして始める
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {products.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white p-4"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[13px] font-semibold text-ink">
                  {p.title}
                </span>
                <span className="num text-[11px] text-muted-foreground">
                  {new Date(p.created_at).toLocaleDateString("ja-JP")}
                </span>
              </div>
              <span className="num text-[13px] font-semibold text-ink">
                〜¥{p.base_price.toLocaleString()}
              </span>
              <Badge variant="outline">{STATUS_LABEL[p.status] ?? p.status}</Badge>
              <div className="flex gap-2">
                {p.status === "published" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    render={<Link href={`/products/${p.slug}`} />}
                  >
                    公開ページ
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  render={<Link href={`/studio/products/${p.id}/edit`} />}
                >
                  編集
                </Button>
                {p.status !== "archived" && <ArchiveButton productId={p.id} />}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
