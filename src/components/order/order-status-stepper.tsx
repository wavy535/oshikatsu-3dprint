import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

// Figma ①購入フロー「注文詳細 2085:1269」の 4 段ステッパー
const STEPS = [
  { key: "paid", label: "決済完了" },
  { key: "printing", label: "印刷中" },
  { key: "shipped", label: "発送済み" },
  { key: "completed", label: "取引完了" },
] as const;

const STEP_INDEX: Record<string, number> = {
  pending_payment: -1,
  paid: 0,
  printing: 1,
  shipped: 2,
  completed: 3,
};

export function OrderStatusStepper({
  status,
  size = "default",
}: {
  status: string;
  size?: "default" | "sm";
}) {
  if (status === "cancelled" || status === "refunded") {
    return (
      <p className="text-[12px] text-muted-foreground">
        {status === "cancelled" ? "キャンセル済み" : "返金済み"}
      </p>
    );
  }

  const currentIndex = STEP_INDEX[status] ?? -1;
  const dot = size === "sm" ? "size-5" : "size-6";
  const text = size === "sm" ? "text-[10.5px]" : "text-xs";

  return (
    <ol className="flex flex-wrap items-center gap-2">
      {STEPS.map((step, i) => {
        const done = i < currentIndex;
        const current = i === currentIndex;
        return (
          <li key={step.key} className="flex items-center gap-2">
            <span
              className={cn(
                "flex items-center justify-center rounded-full text-[10px] font-semibold",
                dot,
                done
                  ? "bg-ok text-white"
                  : current
                    ? "bg-brand text-white"
                    : "bg-ground text-muted-foreground"
              )}
            >
              {done ? <Check className="size-3" aria-hidden /> : i + 1}
            </span>
            <span
              className={cn(
                text,
                current
                  ? "font-semibold text-ink"
                  : done
                    ? "text-ink"
                    : "text-muted-foreground"
              )}
            >
              {step.label}
            </span>
            {i < STEPS.length - 1 && (
              <span
                className={cn("h-px w-6", done ? "bg-ok" : "bg-line")}
                aria-hidden
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
