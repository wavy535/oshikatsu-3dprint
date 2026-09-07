"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal } from "lucide-react";

import { QUEUE_STATUS_FILTERS } from "@/lib/ops/labels";

const SELECT_CLASS =
  "rounded-lg border border-line bg-white px-2.5 py-1.5 text-[11.5px] text-ink outline-none focus:border-brand";

/**
 * 印刷キューの絞り込み。状態はURLのクエリだけが持つ（作品一覧と同じ作り）。
 */
export function QueueFilters({
  materials,
  printers,
}: {
  materials: string[];
  printers: { code: string; model_name: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();

  const push = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`/admin/print-queue${next.size ? `?${next}` : ""}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SlidersHorizontal className="size-3.5 text-muted-foreground" aria-hidden />

      <select
        aria-label="ステータス"
        className={SELECT_CLASS}
        value={params.get("status") ?? "open"}
        onChange={(e) => push("status", e.target.value === "open" ? "" : e.target.value)}
      >
        {QUEUE_STATUS_FILTERS.map((f) => (
          <option key={f.value} value={f.value}>
            ステータス：{f.label}
          </option>
        ))}
      </select>

      <select
        aria-label="素材"
        className={SELECT_CLASS}
        value={params.get("material") ?? ""}
        onChange={(e) => push("material", e.target.value)}
      >
        <option value="">素材：すべて</option>
        {materials.map((m) => (
          <option key={m} value={m}>
            素材：{m}
          </option>
        ))}
      </select>

      <select
        aria-label="プリンタ"
        className={SELECT_CLASS}
        value={params.get("printer") ?? ""}
        onChange={(e) => push("printer", e.target.value)}
      >
        <option value="">プリンタ：すべて</option>
        {printers.map((p) => (
          <option key={p.code} value={p.code}>
            {p.code}（{p.model_name}）
          </option>
        ))}
      </select>

      <form
        className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-line bg-white px-2.5 py-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const value = new FormData(e.currentTarget).get("q");
          push("q", String(value ?? ""));
        }}
      >
        <Search className="size-3.5 text-muted-foreground" aria-hidden />
        <input
          name="q"
          defaultValue={params.get("q") ?? ""}
          placeholder="ジョブ番号・作品名で検索"
          className="w-full bg-transparent text-[11.5px] text-ink outline-none placeholder:text-muted-foreground"
        />
      </form>
    </div>
  );
}
