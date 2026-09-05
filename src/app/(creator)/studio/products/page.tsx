import Link from "next/link";
import { requireCreator } from "@/lib/auth/guards";
import { listMyProducts } from "@/features/products/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArchiveButton } from "./archive-button";

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
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">作品管理</h1>
        <Button render={<Link href="/studio/products/new" />}>作品を投稿</Button>
      </div>

      {products.length === 0 ? (
        <p className="text-sm text-muted-foreground">まだ作品がありません</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>タイトル</TableHead>
              <TableHead>ステータス</TableHead>
              <TableHead>価格</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{p.title}</TableCell>
                <TableCell>
                  <Badge variant="outline">{STATUS_LABEL[p.status] ?? p.status}</Badge>
                </TableCell>
                <TableCell>¥{p.base_price.toLocaleString()}</TableCell>
                <TableCell className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    render={<Link href={`/studio/products/${p.id}/edit`} />}
                  >
                    編集
                  </Button>
                  {p.status !== "archived" && <ArchiveButton productId={p.id} />}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
