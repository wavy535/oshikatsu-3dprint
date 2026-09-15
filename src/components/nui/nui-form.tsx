"use client";

import { useActionState } from "react";
import Link from "next/link";

import { saveNuiAction, type NuiActionState } from "@/lib/nuis/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: NuiActionState = { error: null };

const KINDS = [
  { value: "plush", label: "ぬいぐるみ" },
  { value: "acrylic_stand", label: "アクリルスタンド" },
  { value: "figure", label: "フィギュア" },
  { value: "other", label: "その他" },
];

type Nui = {
  id: string;
  name: string;
  kind: string;
  height_mm: number;
  sit_height_mm: number | null;
  shoulder_width_mm: number | null;
  hug_width_mm: number | null;
};

/**
 * ぬいの登録・編集（Figma ④マイページ「ぬいを登録」）。
 * 必須は身長だけ。座高・肩幅・抱き幅は測れたときだけ入れてもらい、未入力なら相性判定・AR が身長から推定する。
 * サイズ区分は身長からトリガーが決めるので入力欄を出さない。
 */
export function NuiForm({ nui }: { nui?: Nui }) {
  const [state, formAction, pending] = useActionState(saveNuiAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5">
      {nui && <input type="hidden" name="id" value={nui.id} />}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">名前</Label>
        <Input id="name" name="name" defaultValue={nui?.name} placeholder="みるく" required maxLength={40} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="kind">種類</Label>
        <select
          id="kind"
          name="kind"
          defaultValue={nui?.kind ?? "plush"}
          className="h-10 rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-brand"
        >
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="flex flex-col gap-3 rounded-lg bg-ground/60 p-3">
        <legend className="px-1 text-[11.5px] font-semibold text-ink">採寸値（mm）</legend>
        <p className="text-[11px] leading-4 text-muted-foreground">
          作品の内寸と比べて「入るかどうか」を判定します。身長からサイズ区分（10 / 15 / 20cm）も決まります。
        </p>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="heightMm">身長（必須）</Label>
          <Input
            id="heightMm"
            name="heightMm"
            type="number"
            inputMode="numeric"
            min={1}
            max={1000}
            step="0.1"
            defaultValue={nui?.height_mm}
            placeholder="150"
            required
          />
          <p className="text-[10.5px] text-muted-foreground">立たせた状態の、足の裏から頭のてっぺんまで</p>
        </div>

        <p className="text-[10.5px] text-muted-foreground">ここから下は、測れる場合だけ入力してください。</p>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sitHeightMm">座高</Label>
          <Input
            id="sitHeightMm"
            name="sitHeightMm"
            type="number"
            min={1}
            max={1000}
            step="0.1"
            defaultValue={nui?.sit_height_mm ?? ""}
            placeholder="132"
          />
          <p className="text-[10.5px] text-muted-foreground">座らせた状態の、床から頭のてっぺんまで</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="shoulderWidthMm">肩幅</Label>
          <Input
            id="shoulderWidthMm"
            name="shoulderWidthMm"
            type="number"
            min={1}
            max={1000}
            step="0.1"
            defaultValue={nui?.shoulder_width_mm ?? ""}
            placeholder="70"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="hugWidthMm">抱き幅</Label>
          <Input
            id="hugWidthMm"
            name="hugWidthMm"
            type="number"
            min={1}
            max={1000}
            step="0.1"
            defaultValue={nui?.hug_width_mm ?? ""}
            placeholder="86"
          />
          <p className="text-[10.5px] text-muted-foreground">腕を含めた一番広いところ</p>
        </div>
      </fieldset>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "保存しています..." : "保存する"}
        </Button>
        <Button asChild variant="ghost">
          <Link href="/mypage/nuis">やめる</Link>
        </Button>
      </div>
    </form>
  );
}
