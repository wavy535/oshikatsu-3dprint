"use client";

import { useRouter } from "next/navigation";

import { monthLabel } from "@/lib/ops/labels";

/** 売上画面の期間。直近12か月と「全期間」。 */
export function MonthSelect({ value, months }: { value: string; months: string[] }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
      期間
      <select
        value={value}
        onChange={(e) => router.push(`/admin/sales?month=${e.target.value}`)}
        className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-[11.5px] text-ink outline-none focus:border-brand"
      >
        {months.map((m) => (
          <option key={m} value={m}>
            {monthLabel(m)}
          </option>
        ))}
        <option value="all">全期間</option>
      </select>
    </label>
  );
}
