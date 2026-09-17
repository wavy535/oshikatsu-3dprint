"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Star, Trash2 } from "lucide-react";

import { deleteNuiAction, setMainNuiAction, type NuiActionState } from "@/lib/nuis/actions";
import { cn } from "@/lib/utils";

const initialState: NuiActionState = { error: null };

const KIND_LABEL: Record<string, string> = {
  plush: "ぬいぐるみ",
  acrylic_stand: "アクリルスタンド",
  figure: "フィギュア",
  other: "その他",
};

type Nui = {
  id: string;
  name: string;
  kind: string;
  height_mm: number;
  sit_height_mm: number | null;
  shoulder_width_mm: number | null;
  hug_width_mm: number | null;
  nui_size_cm: number | null;
  is_main: boolean;
};

export function NuiRow({ nui }: { nui: Nui }) {
  const [mainState, setMain, settingMain] = useActionState(setMainNuiAction, initialState);
  const [delState, remove, removing] = useActionState(deleteNuiAction, initialState);

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-white p-4">
      <div className="flex items-center gap-2">
        <p className="text-[13.5px] font-semibold text-ink">{nui.name}</p>
        <span className="rounded-full bg-ground px-2 py-0.5 text-[10.5px] text-muted-foreground">
          {KIND_LABEL[nui.kind] ?? nui.kind}
        </span>
        {nui.nui_size_cm && (
          <span className="num rounded-full bg-brand-soft px-2 py-0.5 text-[10.5px] font-semibold text-accent-foreground">
            {nui.nui_size_cm}cm
          </span>
        )}
        {nui.is_main ? (
          <span className="ml-auto flex items-center gap-1 text-[11px] font-semibold text-star">
            <Star className="size-3.5 fill-star" aria-hidden />
            メイン
          </span>
        ) : (
          <form action={setMain} className="ml-auto">
            <input type="hidden" name="id" value={nui.id} />
            <button
              type="submit"
              disabled={settingMain}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-ink"
            >
              <Star className="size-3.5" aria-hidden />
              メインにする
            </button>
          </form>
        )}
      </div>

      <dl className={cn("grid grid-cols-4 gap-2 rounded-lg bg-ground/60 p-2.5 text-[11.5px]")}>
        {[
          ["身長", nui.height_mm],
          ["座高", nui.sit_height_mm],
          ["肩幅", nui.shoulder_width_mm],
          ["抱き幅", nui.hug_width_mm],
        ].map(([label, value]) => (
          <div key={label as string} className="flex flex-col">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="num text-ink">{value ? `${value} mm` : "—"}</dd>
          </div>
        ))}
      </dl>

      <div className="flex items-center gap-3">
        <Link href={`/mypage/nuis/${nui.id}`} className="text-[11.5px] text-brand hover:underline">
          編集する
        </Link>
        <form action={remove} className="ml-auto">
          <input type="hidden" name="id" value={nui.id} />
          <button
            type="submit"
            disabled={removing}
            className="flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-danger"
          >
            <Trash2 className="size-3.5" aria-hidden />
            削除
          </button>
        </form>
      </div>

      {(mainState.error || delState.error) && (
        <p className="text-[11px] text-danger">{mainState.error ?? delState.error}</p>
      )}
    </div>
  );
}
