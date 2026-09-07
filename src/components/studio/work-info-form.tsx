"use client";

import { useActionState, useState } from "react";
import { Info } from "lucide-react";

import { saveWorkInfoAction, type StepActionState } from "@/lib/works/step-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const initialState: StepActionState = { error: null };

type Tag = { id: string; type: string; name: string };

type Variant = {
  id: string;
  sizeLabel: string;
  scaleRatio: number;
  isBase: boolean;
  printFee: number | null;
  grams: number | null;
  hours: number | null;
  price: number | null;
  stock: number | null;
  isListed: boolean;
  isPrintable: boolean;
  unprintableReason: string | null;
  /** 下限価格。課金モデルに応じてDB（work_variant_pricing）が出したもの */
  floorPrice: number;
};

const ACCEPTS = [
  { key: "colorChange", label: "色の変更" },
  { key: "mirror", label: "左右反転" },
  { key: "standHole", label: "スタンド穴の追加" },
  { key: "customSize", label: "サイズの相談" },
  { key: "otherRequest", label: "その他の相談" },
] as const;

/**
 * Figma ②出品フロー「STEP3 作品情報」。
 * 内寸は原寸だけ入力する（他サイズは scale_ratio からトリガーが埋める）。
 */
export function WorkInfoForm({
  workId,
  initial,
  tags,
  variants: initialVariants,
  platformFeeRate,
  feeBilling,
}: {
  workId: string;
  initial: {
    title: string;
    description: string;
    tagIds: string[];
    accepts: Record<string, boolean>;
    fit: { widthMm: number | null; heightMm: number | null; depthMm: number | null };
  };
  tags: Tag[];
  variants: Variant[];
  platformFeeRate: number;
  /** separate = 代行費を作品価格に上乗せして請求する */
  feeBilling: string;
}) {
  const [state, formAction, pending] = useActionState(saveWorkInfoAction, initialState);
  const [title, setTitle] = useState(initial.title === "無題の作品" ? "" : initial.title);
  const [description, setDescription] = useState(initial.description);
  const [tagIds, setTagIds] = useState<string[]>(initial.tagIds);
  const [accepts, setAccepts] = useState(initial.accepts);
  const [fit, setFit] = useState(initial.fit);
  const [variants, setVariants] = useState(initialVariants);

  const payload = JSON.stringify({
    workId,
    title,
    description,
    tagIds,
    accepts: {
      colorChange: Boolean(accepts.colorChange),
      mirror: Boolean(accepts.mirror),
      standHole: Boolean(accepts.standHole),
      customSize: Boolean(accepts.customSize),
      otherRequest: Boolean(accepts.otherRequest),
    },
    fit,
    variants: variants.map((v) => ({
      id: v.id,
      priceJpy: v.price,
      stock: v.stock,
      isListed: v.isListed,
    })),
  });

  function updateVariant(id: string, patch: Partial<Variant>) {
    setVariants((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  }

  const categories = tags.filter((t) => t.type === "category");
  const worldviews = tags.filter((t) => t.type === "worldview");

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="payload" value={payload} />

      <section className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="title">作品名</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            placeholder="ふわもこ台座（丸型）"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="description">説明</Label>
          <textarea
            id="description"
            rows={5}
            maxLength={5000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="使い方や、飾ったときの見え方など"
            className="rounded-lg border border-line bg-white px-3 py-2 text-[12.5px] text-ink outline-none focus:border-brand"
          />
        </div>

        {[
          { label: "カテゴリ", items: categories },
          { label: "世界観", items: worldviews },
        ].map(({ label, items }) => (
          <div key={label} className="flex flex-col gap-1.5">
            <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
            <div className="flex flex-wrap gap-2">
              {items.map((t) => {
                const on = tagIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setTagIds((prev) =>
                        on ? prev.filter((id) => id !== t.id) : [...prev, t.id]
                      )
                    }
                    className={cn(
                      "rounded-full px-3 py-1 text-[12px] transition-colors",
                      on ? "bg-brand text-white" : "bg-ground text-muted-foreground hover:text-ink"
                    )}
                  >
                    {t.name}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
        <div className="flex items-center gap-2">
          <h2 className="text-[13px] font-semibold text-ink">内寸（相性判定に使います）</h2>
          <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10.5px] font-semibold text-accent-foreground">
            原寸だけ入力
          </span>
        </div>
        <p className="text-[11.5px] leading-4 text-muted-foreground">
          ぬいが収まる部分の内側の寸法です。買う人のマイぬいの採寸値と比べて「入るかどうか」を出します。
          他のサイズは倍率から自動で計算されます。
        </p>
        <div className="flex flex-wrap gap-3">
          {([
            ["widthMm", "座面の幅"],
            ["heightMm", "背もたれの高さ"],
            ["depthMm", "座面の奥行"],
          ] as const).map(([key, label]) => (
            <div key={key} className="flex w-40 flex-col gap-1.5">
              <Label htmlFor={key}>{label}（mm）</Label>
              <Input
                id={key}
                type="number"
                min={1}
                max={1000}
                step="0.1"
                value={fit[key] ?? ""}
                onChange={(e) =>
                  setFit((prev) => ({
                    ...prev,
                    [key]: e.target.value === "" ? null : Number(e.target.value),
                  }))
                }
              />
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
        <h2 className="text-[13px] font-semibold text-ink">サイズ展開と価格</h2>
        <p className="flex items-start gap-2 text-[11.5px] leading-4 text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          印刷代行費は解析結果から自動で出ています。
          {feeBilling === "separate"
            ? "代行費は作品価格に上乗せして買う人に請求されるので、ここで決めるのは作品そのものの価格です。受取額は見込みで、発送後に印刷と送料の実費で確定します。"
            : "代行費と手数料を回収できない価格は保存できません。"}
        </p>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[12px]">
            <thead>
              <tr className="border-b border-line text-[10.5px] text-muted-foreground">
                <th className="py-2 text-left font-semibold">サイズ</th>
                <th className="py-2 text-right font-semibold">見積り</th>
                <th className="py-2 text-right font-semibold">代行費</th>
                <th className="py-2 text-right font-semibold">下限</th>
                <th className="py-2 text-right font-semibold">作品価格</th>
                <th className="py-2 text-right font-semibold">支払額 / 受取額（見込み）</th>
                <th className="py-2 text-right font-semibold">在庫</th>
                <th className="py-2 text-center font-semibold">出品</th>
              </tr>
            </thead>
            <tbody>
              {variants.map((v) => {
                const floor = v.floorPrice;
                const tooLow = v.isListed && v.price !== null && v.price < floor;
                // 支払額と受取額はビューと同じ式で、入力に合わせてその場で出す
                const buyerTotal =
                  v.price === null
                    ? null
                    : feeBilling === "separate"
                      ? v.price + (v.printFee ?? 0)
                      : v.price;
                const payout =
                  v.price === null
                    ? null
                    : feeBilling === "separate"
                      ? v.price - Math.round(v.price * platformFeeRate)
                      : v.price - (v.printFee ?? 0) - Math.round(v.price * platformFeeRate);
                return (
                  <tr key={v.id} className="border-b border-line/70 last:border-b-0">
                    <td className="py-2 text-ink">
                      {v.sizeLabel}
                      {v.isBase && (
                        <span className="ml-1 rounded bg-ground px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          原寸
                        </span>
                      )}
                      {!v.isPrintable && (
                        <p className="text-[10.5px] text-danger">{v.unprintableReason}</p>
                      )}
                    </td>
                    <td className="num py-2 text-right text-muted-foreground">
                      {v.grams ?? "—"} g / {v.hours ?? "—"} h
                    </td>
                    <td className="num py-2 text-right text-muted-foreground">
                      ¥{(v.printFee ?? 0).toLocaleString("ja-JP")}
                    </td>
                    <td className="num py-2 text-right text-muted-foreground">
                      ¥{floor.toLocaleString("ja-JP")}
                    </td>
                    <td className="py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        max={500000}
                        step={100}
                        value={v.price ?? ""}
                        onChange={(e) =>
                          updateVariant(v.id, {
                            price: e.target.value === "" ? null : Number(e.target.value),
                          })
                        }
                        className={cn(
                          "num h-9 w-28 rounded-lg border bg-white px-2 text-right text-ink outline-none focus:border-brand",
                          tooLow ? "border-danger" : "border-line"
                        )}
                      />
                    </td>
                    <td className="num py-2 text-right text-muted-foreground">
                      {buyerTotal === null ? "—" : `¥${buyerTotal.toLocaleString("ja-JP")}`}
                      <span className="mx-1">/</span>
                      {payout === null ? "—" : `¥${payout.toLocaleString("ja-JP")}`}
                    </td>
                    <td className="py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        max={9999}
                        value={v.stock ?? ""}
                        onChange={(e) =>
                          updateVariant(v.id, {
                            stock: e.target.value === "" ? null : Number(e.target.value),
                          })
                        }
                        className="num h-9 w-20 rounded-lg border border-line bg-white px-2 text-right text-ink outline-none focus:border-brand"
                      />
                    </td>
                    <td className="py-2 text-center">
                      <input
                        type="checkbox"
                        checked={v.isListed}
                        disabled={!v.isPrintable}
                        onChange={(e) => updateVariant(v.id, { isListed: e.target.checked })}
                        className="size-4 accent-brand"
                        aria-label={`${v.sizeLabel}を出品する`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-2 rounded-xl border border-line bg-white p-5">
        <h2 className="text-[13px] font-semibold text-ink">オーダーメイドで受けられる相談</h2>
        <div className="flex flex-wrap gap-2">
          {ACCEPTS.map((a) => {
            const on = Boolean(accepts[a.key]);
            return (
              <button
                key={a.key}
                type="button"
                aria-pressed={on}
                onClick={() => setAccepts((prev) => ({ ...prev, [a.key]: !on }))}
                className={cn(
                  "rounded-full px-3 py-1 text-[12px] transition-colors",
                  on ? "bg-brand text-white" : "bg-ground text-muted-foreground hover:text-ink"
                )}
              >
                {a.label}
              </button>
            );
          })}
        </div>
      </section>

      {state.error && <p className="text-[12px] text-danger">{state.error}</p>}

      <Button type="submit" disabled={pending} className="self-end">
        {pending ? "保存しています..." : "公開の設定へ進む"}
      </Button>
    </form>
  );
}
