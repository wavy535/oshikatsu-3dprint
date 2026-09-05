import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { listMyCoordinates } from "@/features/coordinates/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default async function MyCoordinatesPage() {
  const { user } = await requireUser();
  const coordinates = await listMyCoordinates(user.id);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">コーデ・推し空間</h1>
        <Button render={<Link href="/mypage/coordinates/new" />}>投稿する</Button>
      </div>
      {coordinates.length === 0 ? (
        <p className="text-sm text-muted-foreground">まだ投稿がありません。</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {coordinates.map((c) => (
            <Link key={c.id} href={`/mypage/coordinates/${c.id}/edit`}>
              <Card>
                <CardContent className="flex items-center gap-3">
                  <div className="size-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.cover_image_url} alt="" className="size-full object-cover" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <p className="text-sm font-medium">{c.title}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant={c.is_public ? "outline" : "secondary"}>
                        {c.is_public ? "公開中" : "非公開"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">♥{c.like_count}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
