"use client";

import { useRouter } from "next/navigation";
import { SORTS, type Sort } from "@/lib/works/list-options";

/** 並べ替え。選ぶとURLのクエリを差し替えて読み直す。 */
export function WorkSortSelect({ value, hrefFor }: { value: Sort; hrefFor: Record<Sort, string> }) {
  const router = useRouter();

  return (
    <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
      並べ替え
      <select
        value={value}
        onChange={(e) => router.push(hrefFor[e.target.value as Sort])}
        className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-brand"
      >
        {Object.entries(SORTS).map(([k, label]) => (
          <option key={k} value={k}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
