"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { saveProductInfo } from "@/features/products/step-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type VariantRow = {
  nuiSizeId: number;
  label: string;
  price: number;
  stock: number;
  agencyFee: number;
  isActive: boolean;
  unavailableReason: string | null;
  /** 造形上限を超えるサイズは出品自体できない */
  selectable: boolean;
};

/**
 * Figma ②出品フロー STEP3（48:842）。
 * サイズごとの販売価格・在庫と、代行費・受取額をその場で出す。
 */
export function ProductInfoForm({
  productId,
  initial,
  categories,
  tags,
  filaments,
  commissionRate,
}: {
  productId: string;
  initial: {
    title: string;
    description: string;
    categoryId: number;
    tagIds: number[];
    filamentIds: number[];
    defaultFilamentId: number | null;
    printNote: string;
    variants: VariantRow[];
  };
  categories: { id: number; name: string }[];
  tags: { id: number; name: string }[];
  filaments: { id: number; name: string; color_hex: string }[];
  commissionRate: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [title, setTitle] = useState(initial.title === "無題の作品" ? "" : initial.title);
  const [description, setDescription] = useState(initial.description);
  const [categoryId, setCategoryId] = useState(initial.categoryId);
  const [tagIds, setTagIds] = useState<number[]>(initial.tagIds);
  const [filamentIds, setFilamentIds] = useState<number[]>(initial.filamentIds);
  const [defaultFilamentId, setDefaultFilamentId] = useState<number | null>(
    initial.defaultFilamentId ?? initial.filamentIds[0] ?? null
  );
  const [printNote, setPrintNote] = useState(initial.printNote);
  const [variants, setVariants] = useState<VariantRow[]>(initial.variants);

  function updateVariant(nuiSizeId: number, patch: Partial<VariantRow>) {
    setVariants((prev) =>
      prev.map((v) => (v.nuiSizeId === nuiSizeId ? { ...v, ...patch } : v))
    );
  }

  function toggleFilament(id: number) {
    setFilamentIds((prev) => {
      const next = prev.includes(id) ? prev.filter((n) => n !== id) : [...prev, id];
      setDefaultFilamentId((cur) =>
        cur != null && next.includes(cur) ? cur : (next[0] ?? null)
      );
      return next;
    });
  }

  async function save(goNext: boolean) {
    if (defaultFilamentId == null) {
      toast.error("色を1つ以上選択してください");
      return;
    }
    setPending(true);
    const result = await saveProductInfo({
      productId,
      title,
      description,
      categoryId,
      tagIds,
      filamentIds,
      defaultFilamentId,
      printNote: printNote || undefined,
      variants: variants.map((v) => ({
        nuiSizeId: v.nuiSizeId,
        price: v.price,
        stock: v.stock,
        isActive: v.isActive,
      })),
    });
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("作品情報を保存しました");
    if (goNext) {
      router.push(`/studio/products/${productId}/steps/4`);
    } else {
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="flex flex-1 flex-col gap-3 rounded-xl border border-line bg-white p-4">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-ink">作品名</span>
          <Input
            value={title}
            maxLength={80}
            placeholder="ゴシックロリータ ティーパーティー ジオラマ"
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-ink">説明</span>
          <Textarea
            rows={6}
            value={description}
            maxLength={5000}
            placeholder="どんな作品か、推しぬいとどう合わせるかを書いてください。"
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-ink">カテゴリ</span>
          <Select
            value={String(categoryId)}
            onValueChange={(v) => v && setCategoryId(Number(v))}
          >
            <SelectTrigger className="w-full">
              <SelectValue>
                {(v) => categories.find((c) => String(c.id) === v)?.name}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium text-ink">タグ（最大10）</span>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => {
              const on = tagIds.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setTagIds((prev) =>
                      on ? prev.filter((n) => n !== t.id) : prev.length >= 10 ? prev : [...prev, t.id]
                    )
                  }
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px]",
                    on
                      ? "border-brand bg-brand-soft text-accent-foreground"
                      : "border-line bg-white text-muted-foreground"
                  )}
                >
                  {t.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium text-ink">
            購入者が選べる色（クリックで選択・★が既定）
          </span>
          <div className="flex flex-wrap gap-1.5">
            {filaments.map((f) => {
              const on = filamentIds.includes(f.id);
              return (
                <span key={f.id} className="flex items-center">
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleFilament(f.id)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-l-full border py-1 pr-2 pl-2.5 text-[11px]",
                      on
                        ? "border-brand bg-brand-soft text-accent-foreground"
                        : "border-line bg-white text-muted-foreground"
                    )}
                  >
                    <span
                      className="size-2.5 rounded-full border border-line"
                      style={{ backgroundColor: f.color_hex }}
                    />
                    {f.name}
                  </button>
                  <button
                    type="button"
                    disabled={!on}
                    aria-label={`${f.name} を既定の色にする`}
                    onClick={() => setDefaultFilamentId(f.id)}
                    className={cn(
                      "rounded-r-full border border-l-0 px-2 py-1 text-[11px]",
                      defaultFilamentId === f.id
                        ? "border-brand bg-brand text-white"
                        : "border-line bg-white text-muted-foreground disabled:opacity-40"
                    )}
                  >
                    ★
                  </button>
                </span>
              );
            })}
          </div>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-ink">
            出力メモ（運営だけが見ます）
          </span>
          <Textarea
            rows={3}
            value={printNote}
            onChange={(e) => setPrintNote(e.target.value)}
          />
        </label>
      </div>

      {/* サイズ展開 */}
      <aside className="flex h-fit w-full flex-col gap-3 rounded-xl border border-line bg-white p-4 lg:w-96">
        <p className="text-sm font-bold text-ink">サイズ展開・価格・在庫</p>
        <div className="flex flex-col gap-3">
          {variants.map((v) => {
            const commission = Math.round(v.price * commissionRate);
            const revenue = v.price - commission;
            return (
              <div
                key={v.nuiSizeId}
                className={cn(
                  "flex flex-col gap-2 rounded-lg border p-3",
                  v.isActive ? "border-brand/40 bg-brand-soft/30" : "border-line bg-ground"
                )}
              >
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-3.5 accent-[color:var(--brand)]"
                    checked={v.isActive}
                    disabled={!v.selectable}
                    onChange={(e) =>
                      updateVariant(v.nuiSizeId, { isActive: e.target.checked })
                    }
                  />
                  <span className="text-[13px] font-bold text-ink">{v.label}</span>
                  {!v.selectable && (
                    <span className="text-[10.5px] text-muted-foreground">
                      {v.unavailableReason ?? "取扱なし"}
                    </span>
                  )}
                </label>

                {v.isActive && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex flex-col gap-1">
                        <span className="text-[10.5px] text-muted-foreground">
                          販売価格（円）
                        </span>
                        <Input
                          type="number"
                          min={100}
                          max={500000}
                          value={v.price}
                          onChange={(e) =>
                            updateVariant(v.nuiSizeId, {
                              price: Number(e.target.value) || 0,
                            })
                          }
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[10.5px] text-muted-foreground">在庫</span>
                        <Input
                          type="number"
                          min={0}
                          max={9999}
                          value={v.stock}
                          onChange={(e) =>
                            updateVariant(v.nuiSizeId, {
                              stock: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                        />
                      </label>
                    </div>
                    <dl className="flex flex-col gap-0.5 text-[10.5px]">
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">印刷代行費（目安）</dt>
                        <dd className="num text-ink">¥{v.agencyFee.toLocaleString()}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">
                          手数料（{Math.round(commissionRate * 100)}%）
                        </dt>
                        <dd className="num text-ink">−¥{commission.toLocaleString()}</dd>
                      </div>
                      <div className="flex justify-between font-semibold">
                        <dt className="text-ink">受取額</dt>
                        <dd className="num text-brand">¥{revenue.toLocaleString()}</dd>
                      </div>
                    </dl>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={pending} onClick={() => save(false)}>
            保存
          </Button>
          <Button type="button" className="flex-1" disabled={pending} onClick={() => save(true)}>
            {pending ? "保存中..." : "次へ（サムネイル）"}
          </Button>
        </div>
      </aside>
    </div>
  );
}
