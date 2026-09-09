import Link from "next/link";
import { pageHref } from "@/lib/pagination";

/** A fixed number of links even when there are many pages. No speculative reads. */
export function Pagination({
  path,
  params = {},
  page,
  hasNext,
  pageKey = "page",
  label = "ページ切り替え",
}: {
  path: string;
  params?: Record<string, string | string[] | undefined>;
  page: number;
  hasNext: boolean;
  pageKey?: string;
  label?: string;
}) {
  if (page === 1 && !hasNext) return null;
  const style =
    "rounded-lg border border-line bg-white px-3 py-1.5 text-xs text-ink hover:bg-ground";
  return (
    <nav
      aria-label={label}
      className="flex items-center justify-center gap-3 py-2"
    >
      {page > 1 && (
        <Link
          prefetch={false}
          className={style}
          href={pageHref(path, params, page - 1, pageKey)}
        >
          前へ
        </Link>
      )}
      <span className="num text-xs text-muted-foreground" aria-current="page">
        {page}ページ目
      </span>
      {hasNext && (
        <Link
          prefetch={false}
          className={style}
          href={pageHref(path, params, page + 1, pageKey)}
        >
          次へ
        </Link>
      )}
    </nav>
  );
}
