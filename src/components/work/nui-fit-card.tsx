import Link from "next/link";
import { Ruler } from "lucide-react";
import type { FitVerdict } from "@/types/db";
import { cn } from "@/lib/utils";

const VERDICT: Record<FitVerdict, { label: string; className: string }> = {
  good: { label: "ぴったり", className: "bg-ok-bg text-ok" },
  loose: { label: "余裕あり", className: "bg-ok-bg text-ok" },
  tight: { label: "ぎりぎり", className: "bg-warn-bg text-warn" },
  too_small: { label: "入りません", className: "bg-danger-bg text-danger" },
  unknown: { label: "判定できません", className: "bg-ground text-muted-foreground" },
};

const AXIS_LABEL: Record<string, string> = {
  width: "座面の幅",
  height: "背もたれの高さ",
  depth: "座面の奥行",
};

type Axis = {
  axis: string | null;
  slot_mm: number | null;
  nui_mm: number | null;
  margin_mm: number | null;
  verdict: FitVerdict | null;
};

/**
 * マイぬいとの相性。合成イメージではなく
 * 「作品の内寸 × マイぬいの採寸値」の数値比較で出す（設計判断5）。
 */
export function NuiFitCard({
  fit,
  nuiName,
  signedIn,
  hasNui,
}: {
  fit: { axes: Axis[]; verdict: FitVerdict | null } | null;
  nuiName: string | null;
  signedIn: boolean;
  hasNui: boolean;
}) {
  if (!signedIn || !hasNui) {
    return (
      <div className="flex flex-col gap-1.5 rounded-lg border border-dashed border-line bg-ground/60 p-3">
        <p className="flex items-center gap-1.5 text-[12px] font-semibold text-ink">
          <Ruler className="size-3.5" aria-hidden />
          マイぬいとの相性
        </p>
        <p className="text-[11.5px] leading-4 text-muted-foreground">
          うちの子の採寸値を登録すると、この作品に入るかどうかを数値で判定します。
        </p>
        <Link
          href={signedIn ? "/mypage/nuis" : "/login?redirect=/mypage/nuis"}
          className="text-[11.5px] font-semibold text-brand hover:underline"
        >
          {signedIn ? "マイぬいを登録する" : "ログインして登録する"}
        </Link>
      </div>
    );
  }

  if (!fit) return null;

  const verdict = VERDICT[fit.verdict ?? "unknown"];

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-ground/60 p-3">
      <div className="flex items-center gap-2">
        <p className="flex items-center gap-1.5 text-[12px] font-semibold text-ink">
          <Ruler className="size-3.5" aria-hidden />
          {nuiName}との相性
        </p>
        <span
          className={cn(
            "ml-auto rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
            verdict.className
          )}
        >
          {verdict.label}
        </span>
      </div>

      <table className="w-full text-[11.5px]">
        <tbody>
          {fit.axes.map((a) => (
            <tr key={a.axis} className="border-t border-line/70 first:border-t-0">
              <td className="py-1 text-muted-foreground">{AXIS_LABEL[a.axis ?? ""] ?? a.axis}</td>
              <td className="num py-1 text-right text-ink">
                {a.slot_mm ?? "—"} / {a.nui_mm ?? "—"} mm
              </td>
              <td className="num py-1 pl-2 text-right text-muted-foreground">
                {a.margin_mm === null ? "—" : `${a.margin_mm > 0 ? "+" : ""}${a.margin_mm}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10.5px] text-muted-foreground">作品の内寸 / うちの子の採寸値（差）</p>
    </div>
  );
}
