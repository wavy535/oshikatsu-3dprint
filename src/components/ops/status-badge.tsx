import { cn } from "@/lib/utils";
import { JOB_STATUS_LABEL, JOB_STATUS_TONE, type Tone } from "@/lib/ops/labels";
import type { PrintJobStatus } from "@/types/db";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-ground text-muted-foreground",
  info: "bg-brand-soft text-brand",
  warn: "bg-warn-bg text-warn",
  ok: "bg-ok-bg text-ok",
  danger: "bg-danger-bg text-danger",
};

export function Pill({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] leading-4 font-semibold whitespace-nowrap",
        TONE_CLASS[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/** 期限を過ぎたジョブは、ステータスより先に「期限超過」を出す。 */
export function JobStatusBadge({
  status,
  isOverdue,
}: {
  status: PrintJobStatus;
  isOverdue?: boolean | null;
}) {
  if (isOverdue) return <Pill tone="danger">期限超過</Pill>;
  return <Pill tone={JOB_STATUS_TONE[status]}>{JOB_STATUS_LABEL[status]}</Pill>;
}
