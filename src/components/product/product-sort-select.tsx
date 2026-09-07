"use client";

import { parseAsStringLiteral, useQueryState } from "nuqs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const SORT_OPTIONS = ["newest", "popular", "price_asc", "price_desc", "rating"] as const;
const SORT_LABEL: Record<(typeof SORT_OPTIONS)[number], string> = {
  newest: "新着順",
  popular: "人気順",
  price_asc: "価格が安い順",
  price_desc: "価格が高い順",
  rating: "評価順",
};

export function ProductSortSelect() {
  const [sort, setSort] = useQueryState(
    "sort",
    parseAsStringLiteral(SORT_OPTIONS).withDefault("newest").withOptions({
      shallow: false,
      clearOnDefault: false,
    })
  );

  return (
    <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
      <SelectTrigger className="h-8 w-32 text-xs">
        <SelectValue>
          {(v) => SORT_LABEL[v as (typeof SORT_OPTIONS)[number]]}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {SORT_OPTIONS.map((s) => (
          <SelectItem key={s} value={s}>
            {SORT_LABEL[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
