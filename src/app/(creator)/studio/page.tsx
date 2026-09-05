import Link from "next/link";
import { requireCreator } from "@/lib/auth/guards";
import { listMyProducts } from "@/features/products/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function StudioDashboardPage() {
  const { user } = await requireCreator();
  const products = await listMyProducts(user.id);

  const published = products.filter((p) => p.status === "published").length;
  const inReview = products.filter((p) => p.status === "in_review").length;
  const draft = products.filter((p) => p.status === "draft").length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">ダッシュボード</h1>
        <Button render={<Link href="/studio/products/new" />}>作品を投稿</Button>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">公開中</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{published}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">審査中</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{inReview}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">下書き</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{draft}</CardContent>
        </Card>
      </div>
    </div>
  );
}
