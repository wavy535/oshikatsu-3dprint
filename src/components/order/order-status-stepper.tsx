const STEPS = [
  { key: "paid", label: "支払い完了" },
  { key: "printing", label: "制作中" },
  { key: "shipped", label: "発送済み" },
  { key: "completed", label: "受取完了" },
] as const;

const STEP_INDEX: Record<string, number> = {
  pending_payment: -1,
  paid: 0,
  printing: 1,
  shipped: 2,
  completed: 3,
};

export function OrderStatusStepper({ status }: { status: string }) {
  if (status === "cancelled" || status === "refunded") {
    return (
      <p className="text-sm text-muted-foreground">
        {status === "cancelled" ? "キャンセル済み" : "返金済み"}
      </p>
    );
  }

  const currentIndex = STEP_INDEX[status] ?? -1;

  return (
    <div className="flex items-center gap-2">
      {STEPS.map((step, i) => (
        <div key={step.key} className="flex items-center gap-2">
          <div
            className={`flex size-6 items-center justify-center rounded-full text-xs ${
              i <= currentIndex
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {i + 1}
          </div>
          <span
            className={`text-xs ${i <= currentIndex ? "text-foreground" : "text-muted-foreground"}`}
          >
            {step.label}
          </span>
          {i < STEPS.length - 1 && <div className="h-px w-6 bg-border" />}
        </div>
      ))}
    </div>
  );
}
