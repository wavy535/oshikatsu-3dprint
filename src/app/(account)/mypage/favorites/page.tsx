import Link from "next/link";
import { Heart } from "lucide-react";

import { requireUser } from "@/lib/auth/guards";
import { workImageUrl } from "@/lib/storage";
import { yen } from "@/components/work/work-card";
import { Button } from "@/components/ui/button";

export const metadata = { title: "お気に入り" };

const SORTS = {
  favorited: "追加した順",
  popular: "人気順",
  price_asc: "価格が安い順",
} as const;
type FavSort = keyof typeof SORTS;

/**
 * Figma ④マイページ「お気に入り一覧」。
 * my_favorites ビューは並べ替えのキーと「追加後に値下がりしたか」を持っている。
 */
export default async function FavoritesPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const { sort } = await searchParams;
  const active = (sort && sort in SORTS ? sort : "favorited") as FavSort;
  const { supabase, user } = await requireUser("/mypage/favorites");

  let query = supabase.from("my_favorites").select("*").eq("user_id", user.id);
  if (active === "popular") query = query.order("favorite_count", { ascending: false });
  else if (active === "price_asc")
    query = query.order("min_price_jpy", { ascending: true, nullsFirst: false });
  else query = query.order("favorited_at", { ascending: false });

  const { data } = await query;
  const rows = data ?? [];

  // サムネイルは別引き（ビューには画像が入っていない）
  const ids = rows.map((r) => r.id!).filter(Boolean) as string[];
  const { data: images } = ids.length
    ? await supabase
        .from("work_images")
        .select("work_id, storage_path, sort_order")
        .in("work_id", ids)
        .order("sort_order", { ascending: true })
    : { data: [] };
  const firstImage = new Map<string, string>();
  for (const img of images ?? []) {
    if (!firstImage.has(img.work_id)) firstImage.set(img.work_id, img.storage_path);
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-base font-bold text-ink">お気に入り</h1>
        <span className="num text-[12px] text-muted-foreground">{rows.length}件</span>
        <nav className="ml-auto flex gap-1">
          {Object.entries(SORTS).map(([k, label]) => (
            <Link
              key={k}
              href={`/mypage/favorites?sort=${k}`}
              className={
                k === active
                  ? "rounded-full bg-brand px-3 py-1 text-[11.5px] font-semibold text-white"
                  : "rounded-full bg-white px-3 py-1 text-[11.5px] text-muted-foreground hover:text-ink"
              }
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-line bg-white px-6 py-16 text-center">
          <Heart className="size-6 text-line" aria-hidden />
          <p className="text-sm font-semibold text-ink">お気に入りはまだありません</p>
          <Button asChild size="sm" className="mt-2">
            <Link href="/works">作品をさがす</Link>
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((r) => {
            const image = workImageUrl(firstImage.get(r.id!));
            return (
              <Link
                key={r.id}
                href={`/works/${r.id}`}
                className="flex gap-3 rounded-xl border border-line bg-white p-3 hover:bg-ground/40"
              >
                <span className="size-20 shrink-0 overflow-hidden rounded-lg bg-ground">
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image} alt="" className="size-full object-cover" />
                  ) : null}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate text-[13px] font-semibold text-ink">{r.title}</span>
                  <span className="truncate text-[11px] text-muted-foreground">
                    {r.creator_name}
                  </span>
                  <span className="mt-auto flex items-center gap-2">
                    <span className="num text-sm font-bold text-ink">{yen(r.min_price_jpy)}</span>
                    {r.dropped_since_favorited && (
                      <span className="rounded bg-danger-bg px-1.5 py-0.5 text-[10px] font-semibold text-danger">
                        追加後に値下げ
                      </span>
                    )}
                    {!r.has_stock && (
                      <span className="rounded bg-ground px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        在庫なし
                      </span>
                    )}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
