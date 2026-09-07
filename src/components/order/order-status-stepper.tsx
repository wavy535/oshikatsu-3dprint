import { Check } from "lucide-react";
import type { OrderStatus } from "@/types/db";
import { cn } from "@/lib/utils";

// Figma ①購入フロー「注文詳細」の4段ステッパー。
// 細かいDBのステータスは、買う人から見える4段へ畳んで出す。
const STEPS = [
  { key: "paid", label: "決済完了", covers: ["paid", "printing_queued", "printing", "packaging", "shipped", "completed"] },
  { key: "printing", label: "印刷中", covers: ["printing_queued", "printing", "packaging", "shipped", "completed"] },
  { key: "shipped", label: "発送済み", covers: ["shipped", "completed"] },
  { key: "completed", label: "取引完了", covers: ["completed"] },
] as const;

export function OrderStatusStepper({ status }: { status: OrderStatus }) {
  if (status === "cancelled" || status === "refunded" || status === "payment_pending") {
    return (
      <p className="rounded-lg bg-ground px-3 py-2 text-[12px] text-muted-foreground">
        {status === "payment_pending" ? "お支払いの確認を待っています" : "この注文は取引が終了しています"}
      </p>
    );
  }

  return (
    <ol className="flex items-center gap-2">
      {STEPS.map((step, i) => {
        const done = (step.covers as readonly string[]).includes(status);
        return (
          <li key={step.key} className="flex flex-1 items-center gap-2">
            <span className="flex flex-col items-center gap-1">
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full text-[10px] font-semibold",
                  done ? "bg-brand text-white" : "bg-ground text-muted-foreground"
                )}
              >
                {done ? <Check className="size-3.5" aria-hidden /> : i + 1}
              </span>
              <span className={cn("text-[10.5px]", done ? "text-ink" : "text-muted-foreground")}>
                {step.label}
              </span>
            </span>
            {i < STEPS.length - 1 && (
              <span className={cn("h-px flex-1", done ? "bg-brand" : "bg-line")} />
            )}
          </li>
        );
      })}
    </ol>
  );
}
