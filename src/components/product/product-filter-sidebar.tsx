"use client";

import {
  parseAsArrayOf,
  parseAsInteger,
  useQueryStates,
} from "nuqs";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type MasterOption = { id: number; label: string };

function CheckRow({
  checked,
  label,
  onToggle,
}: {
  checked: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
      className="flex items-center gap-2 text-left text-xs text-ink"
    >
      <span
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors",
          checked ? "border-brand bg-brand text-white" : "border-line bg-white"
        )}
      >
        {checked ? <Check className="size-2.5" aria-hidden /> : null}
      </span>
      {label}
    </button>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold text-ink">{title}</p>
      {children}
    </div>
  );
}

/**
 * Figma ①購入フロー「検索結果 2038:873」左カラムの絞り込みパネル。
 * 条件は URL クエリに載せる（nuqs, shallow:false）ので、サーバー側の
 * searchProducts がそのまま再実行される。
 */
export function ProductFilterSidebar({
  categories,
  nuiSizes,
  tags,
  defaultNuiSizeIds = [],
}: {
  categories: MasterOption[];
  nuiSizes: MasterOption[];
  tags: MasterOption[];
  defaultNuiSizeIds?: number[];
}) {
  const [filters, setFilters] = useQueryStates(
    {
      category: parseAsInteger,
      nuiSizes: parseAsArrayOf(parseAsInteger).withDefault(defaultNuiSizeIds),
      tags: parseAsArrayOf(parseAsInteger).withDefault([]),
      priceMin: parseAsInteger,
      priceMax: parseAsInteger,
    },
    { shallow: false, clearOnDefault: false }
  );

  const toggleIn = (list: number[], id: number) =>
    list.includes(id) ? list.filter((n) => n !== id) : [...list, id];

  return (
    <aside className="flex w-full shrink-0 flex-col gap-4 rounded-xl border border-line bg-white p-4 lg:w-[220px]">
      <Section title="カテゴリ">
        {categories.map((c) => (
          <CheckRow
            key={c.id}
            label={c.label}
            checked={filters.category === c.id}
            onToggle={() =>
              setFilters({ category: filters.category === c.id ? null : c.id })
            }
          />
        ))}
      </Section>

      <div className="h-px bg-line" />

      <Section title="対応ぬいサイズ">
        {nuiSizes.map((s) => (
          <CheckRow
            key={s.id}
            label={s.label}
            checked={filters.nuiSizes.includes(s.id)}
            onToggle={() => {
              const next = toggleIn(filters.nuiSizes, s.id);
              setFilters({ nuiSizes: next.length ? next : null });
            }}
          />
        ))}
      </Section>

      {tags.length > 0 && (
        <>
          <div className="h-px bg-line" />
          <Section title="世界観タグ">
            {tags.map((t) => (
              <CheckRow
                key={t.id}
                label={t.label}
                checked={filters.tags.includes(t.id)}
                onToggle={() => {
                  const next = toggleIn(filters.tags, t.id);
                  setFilters({ tags: next.length ? next : null });
                }}
              />
            ))}
          </Section>
        </>
      )}

      <div className="h-px bg-line" />

      <Section title="価格帯">
        <div className="flex items-center gap-2">
          <Input
            type="number"
            inputMode="numeric"
            placeholder="下限"
            aria-label="最低価格"
            className="h-8 text-xs"
            value={filters.priceMin ?? ""}
            onChange={(e) =>
              setFilters({
                priceMin: e.target.value === "" ? null : Number(e.target.value),
              })
            }
          />
          <span className="text-xs text-muted-foreground">〜</span>
          <Input
            type="number"
            inputMode="numeric"
            placeholder="上限"
            aria-label="最高価格"
            className="h-8 text-xs"
            value={filters.priceMax ?? ""}
            onChange={(e) =>
              setFilters({
                priceMax: e.target.value === "" ? null : Number(e.target.value),
              })
            }
          />
        </div>
      </Section>
    </aside>
  );
}
