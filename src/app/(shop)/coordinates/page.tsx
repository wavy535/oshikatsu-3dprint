import Link from "next/link";
import { listCoordinates } from "@/features/coordinates/queries";

export default async function CoordinatesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page } = await searchParams;
  const { items } = await listCoordinates({ page: page ? Number(page) : 1 });

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <h1 className="text-xl font-semibold">コーデ・推し空間</h1>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">まだ投稿がありません。</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {items.map((c) => (
            <Link key={c.id} href={`/coordinates/${c.id}`} className="flex flex-col gap-1">
              <div className="aspect-square overflow-hidden rounded-lg bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.cover_image_url} alt={c.title} className="size-full object-cover" />
              </div>
              <p className="truncate text-sm font-medium">{c.title}</p>
              <p className="text-xs text-muted-foreground">
                {c.profiles?.display_name} ・ ♥{c.like_count}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
