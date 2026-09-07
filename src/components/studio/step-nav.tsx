import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { n: 1, label: "3Dデータ" },
  { n: 2, label: "印刷指示" },
  { n: 3, label: "作品情報" },
  { n: 4, label: "公開" },
];

/** Figma ②出品フローの4STEP。済んだSTEPへは戻れる。 */
export function StepNav({ workId, current }: { workId: string; current: number }) {
  return (
    <ol className="flex items-center gap-2 rounded-xl border border-line bg-white p-3">
      {STEPS.map((s, i) => {
        const done = s.n < current;
        const active = s.n === current;
        const content = (
          <span className="flex items-center gap-2">
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-full text-[10.5px] font-semibold",
                active ? "bg-brand text-white" : done ? "bg-ok text-white" : "bg-ground text-muted-foreground"
              )}
            >
              {done ? <Check className="size-3.5" aria-hidden /> : s.n}
            </span>
            <span className={cn("text-[12px]", active ? "font-semibold text-ink" : "text-muted-foreground")}>
              {s.label}
            </span>
          </span>
        );
        return (
          <li key={s.n} className="flex flex-1 items-center gap-2">
            {done ? (
              <Link href={`/studio/works/${workId}/steps/${s.n}`} className="hover:opacity-80">
                {content}
              </Link>
            ) : (
              content
            )}
            {i < STEPS.length - 1 && (
              <span className={cn("h-px flex-1", done ? "bg-ok" : "bg-line")} />
            )}
          </li>
        );
      })}
    </ol>
  );
}
