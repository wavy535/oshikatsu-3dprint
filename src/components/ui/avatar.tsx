import { cn } from "@/lib/utils";

/**
 * アバター。画像が無ければ表示名の頭文字を出す。
 * Radix の Avatar は依存を増やすだけになるので使っていない
 * （画像の遅延ロード状態を出し分ける必要がまだ無いため）。
 */
export function Avatar({
  src,
  name,
  className,
}: {
  src?: string | null;
  name?: string | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-soft text-[11px] font-semibold text-accent-foreground",
        className
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        (name?.trim().slice(0, 1) ?? "U")
      )}
    </span>
  );
}
