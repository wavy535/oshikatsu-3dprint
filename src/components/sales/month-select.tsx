"use client";

import { useRouter } from "next/navigation";

import { monthLabel } from "@/lib/ops/labels";

/** 月の切り替え（売上ダッシュボード）。 */
export function MonthSelect({ value, months, basePath }: { value: string; months: string[]; basePath: string }) {
  const router = useRouter();
  return (
    <select
      aria-label="月"
      value={value}
      onChange={(e) => router.push(`${basePath}?month=${e.target.value}`)}
      className="num rounded-lg border border-line bg-white px-2.5 py-1.5 text-[11.5px] text-ink outline-none focus:border-brand"
    >
      {months.map((m) => (
        <option key={m} value={m}>
          {monthLabel(m)}
        </option>
      ))}
    </select>
  );
}
