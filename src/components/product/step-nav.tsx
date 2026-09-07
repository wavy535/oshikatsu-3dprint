import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const POST_STEPS = [
  { step: 1, label: "3Dデータ" },
  { step: 2, label: "印刷指示" },
  { step: 3, label: "作品情報" },
  { step: 4, label: "サムネイル" },
] as const;

/**
 * Figma ②出品フロー の STEP バー。productId が無い（新規の STEP1）ときは
 * リンクにせず、現在地だけを見せる。
 */
export function StepNav({
  current,
  productId,
}: {
  current: number;
  productId?: string;
}) {
  return (
    <ol className="flex flex-wrap items-center gap-1.5">
      {POST_STEPS.map(({ step, label }, i) => {
        const done = step < current;
        const active = step === current;
        const content = (
          <span
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? "border-brand bg-brand text-white"
                : done
                  ? "border-ok-line bg-ok-bg text-ok"
                  : "border-line bg-white text-muted-foreground"
            )}
          >
            <span
              className={cn(
                "flex size-4 items-center justify-center rounded-full text-[10px]",
                active ? "bg-white/25" : done ? "bg-ok/15" : "bg-ground"
              )}
            >
              {done ? <Check className="size-2.5" aria-hidden /> : step}
            </span>
            {label}
          </span>
        );

        return (
          <li key={step} className="flex items-center gap-1.5">
            {productId && !active ? (
              <Link href={`/studio/products/${productId}/steps/${step}`}>{content}</Link>
            ) : (
              content
            )}
            {i < POST_STEPS.length - 1 && (
              <span className="text-xs text-muted-foreground" aria-hidden>
                ›
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
