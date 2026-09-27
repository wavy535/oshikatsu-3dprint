import { Pill } from "@/components/ops/status-badge";
import type { Tone } from "@/lib/ops/labels";

/** 一覧の上に並べる数字のカード（印刷キューの4枚と同じ見た目）。 */
export function StatCard({
  label,
  tone = "neutral",
  value,
  note,
}: {
  label: string;
  tone?: Tone;
  value: React.ReactNode;
  note?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-5">
      <Pill tone={tone}>{label}</Pill>
      <p className="num text-[26px] leading-10 font-bold text-ink">{value}</p>
      {note && <p className="text-sm text-muted-foreground">{note}</p>}
    </div>
  );
}

export function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-line bg-white p-3.5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg leading-normal font-semibold text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Row({ label, value, warn }: { label: string; value: React.ReactNode; warn?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="flex-1 text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm font-semibold ${warn ? "text-warn" : "text-ink"}`}>{value}</span>
    </div>
  );
}

export const TH = "px-4 py-3 text-left font-semibold";
export const TD = "px-4 py-3";
