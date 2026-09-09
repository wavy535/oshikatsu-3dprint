"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal } from "lucide-react";

const SELECT_CLASS =
  "rounded-lg border border-line bg-white px-2.5 py-1.5 text-[11.5px] text-ink outline-none focus:border-brand";

export type FilterSelect = {
  name: string;
  /** 「すべて」を選んだときの値。空文字ならクエリから消す */
  defaultValue?: string;
  options: { value: string; label: string }[];
};

/**
 * 一覧画面の絞り込み（注文一覧・出荷済みで共用）。
 * 状態はURLのクエリだけが持つ。印刷キューの QueueFilters と同じ作り。
 */
export function ListFilters({
  basePath,
  selects,
  searchPlaceholder,
}: {
  basePath: string;
  selects: FilterSelect[];
  searchPlaceholder: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const push = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    next.delete("page");
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`${basePath}${next.size ? `?${next}` : ""}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SlidersHorizontal className="size-3.5 text-muted-foreground" aria-hidden />
      {selects.map((s) => (
        <select
          key={s.name}
          aria-label={s.name}
          className={SELECT_CLASS}
          value={params.get(s.name) ?? s.defaultValue ?? ""}
          onChange={(e) =>
            push(s.name, e.target.value === (s.defaultValue ?? "") ? "" : e.target.value)
          }
        >
          {s.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ))}

      <form
        className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-line bg-white px-2.5 py-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          push("q", String(new FormData(e.currentTarget).get("q") ?? ""));
        }}
      >
        <Search className="size-3.5 text-muted-foreground" aria-hidden />
        <input
          name="q"
          defaultValue={params.get("q") ?? ""}
          placeholder={searchPlaceholder}
          className="w-full bg-transparent text-[11.5px] text-ink outline-none placeholder:text-muted-foreground"
        />
      </form>
    </div>
  );
}
