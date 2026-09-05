import Link from "next/link";

type PinnedItem = {
  id: string;
  pin_x: number | null;
  pin_y: number | null;
  note: string | null;
  products: { title: string; slug: string; base_price: number } | null;
};

export function CoordinateCanvas({
  coverImageUrl,
  title,
  items,
}: {
  coverImageUrl: string;
  title: string;
  items: PinnedItem[];
}) {
  const pinned = items.filter((i) => i.pin_x != null && i.pin_y != null && i.products);

  return (
    <div className="relative w-full overflow-hidden rounded-xl bg-muted">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={coverImageUrl} alt={title} className="w-full object-cover" />
      {pinned.map((item) => (
        <Link
          key={item.id}
          href={`/products/${item.products!.slug}`}
          className="absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-primary text-xs text-primary-foreground shadow"
          style={{ left: `${item.pin_x! * 100}%`, top: `${item.pin_y! * 100}%` }}
          title={item.products!.title}
        >
          +
        </Link>
      ))}
    </div>
  );
}
