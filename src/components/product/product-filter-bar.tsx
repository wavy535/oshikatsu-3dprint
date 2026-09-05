"use client";

import {
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryStates,
} from "nuqs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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

type MasterOption = { id: number; label: string };

export function ProductFilterBar({
  categories,
  nuiSizes,
  defaultNuiSizeIds = [],
}: {
  categories: MasterOption[];
  nuiSizes: MasterOption[];
  defaultNuiSizeIds?: number[];
}) {
  const [filters, setFilters] = useQueryStates(
    {
      q: parseAsString.withDefault(""),
      category: parseAsInteger,
      nuiSizes: parseAsArrayOf(parseAsInteger).withDefault(defaultNuiSizeIds),
      priceMin: parseAsInteger,
      priceMax: parseAsInteger,
      sort: parseAsStringLiteral(SORT_OPTIONS).withDefault("newest"),
    },
    { shallow: false, clearOnDefault: false }
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="キーワード検索"
          value={filters.q}
          onChange={(e) => setFilters({ q: e.target.value || null })}
          className="max-w-xs"
        />
        <Select
          value={filters.category != null ? String(filters.category) : "all"}
          onValueChange={(v) => setFilters({ category: v === "all" ? null : Number(v) })}
        >
          <SelectTrigger>
            <SelectValue placeholder="カテゴリ" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべてのカテゴリ</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.sort} onValueChange={(v) => setFilters({ sort: v as typeof filters.sort })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {SORT_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="number"
          placeholder="最低価格"
          value={filters.priceMin ?? ""}
          onChange={(e) =>
            setFilters({ priceMin: e.target.value === "" ? null : Number(e.target.value) })
          }
          className="w-28"
        />
        <Input
          type="number"
          placeholder="最高価格"
          value={filters.priceMax ?? ""}
          onChange={(e) =>
            setFilters({ priceMax: e.target.value === "" ? null : Number(e.target.value) })
          }
          className="w-28"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-muted-foreground">対応サイズ</span>
        {nuiSizes.map((size) => {
          const checked = filters.nuiSizes.includes(size.id);
          return (
            <label key={size.id} className="flex items-center gap-1.5 text-sm">
              <Checkbox
                checked={checked}
                onCheckedChange={(v) => {
                  const next = v
                    ? [...filters.nuiSizes, size.id]
                    : filters.nuiSizes.filter((id) => id !== size.id);
                  setFilters({ nuiSizes: next.length ? next : null });
                }}
              />
              {size.label}
            </label>
          );
        })}
        {defaultNuiSizeIds.length > 0 &&
          filters.nuiSizes.length === defaultNuiSizeIds.length &&
          defaultNuiSizeIds.every((id) => filters.nuiSizes.includes(id)) && (
            <Badge variant="outline">うちの子に合う作品だけ表示中</Badge>
          )}
      </div>
    </div>
  );
}
