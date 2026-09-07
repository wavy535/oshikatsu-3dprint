import { Suspense } from "react";
import Link from "next/link";
import { AlertTriangle, ImageIcon } from "lucide-react";

import {
  getQueueFilterOptions,
  getQueueSummary,
  listPrintQueue,
  type QueueSearchParams,
} from "@/lib/ops/queries";
import { shortDateTime } from "@/lib/ops/labels";
import { workImageUrl } from "@/lib/storage";
import { QueueFilters } from "@/components/ops/queue-filters";
import { JobStatusBadge, Pill } from "@/components/ops/status-badge";

export const metadata = { title: "印刷キュー" };

/**
 * Figma ⑤運営オペレーション「印刷キュー一覧 2079:1163」。
 *
 * 行から進めるのは2つだけ。まだ刷っていないものは「詳細」（＝ジョブ詳細で
 * プリンタを割り当てて開始）、刷り終わったものは「検品」。
 */
export default async function PrintQueuePage({
  searchParams,
}: {
  searchParams: Promise<QueueSearchParams>;
}) {
  const sp = await searchParams;
  const [jobs, summary, options] = await Promise.all([
    listPrintQueue(sp),
    getQueueSummary(),
    getQueueFilterOptions(),
  ]);

  const cards = [
    {
      label: "未着手",
      tone: "neutral" as const,
      value: summary.queued,
      note: `24時間以内の期限 ${summary.queuedDueSoon}件`,
    },
    {
      label: "印刷中",
      tone: "info" as const,
      value: summary.printing,
      note: `推定 ${summary.printingHours.toFixed(1)}h ぶん`,
    },
    {
      label: "検品待ち",
      tone: "warn" as const,
      value: summary.waitingQc,
      note: `24時間以内の期限 ${summary.waitingQcDueSoon}件`,
    },
    {
      label: "期限超過",
      tone: "danger" as const,
      value: summary.overdue,
      note: summary.overdue > 0 ? "要エスカレーション" : "なし",
    },
  ];

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="flex flex-col gap-1 rounded-xl border border-line bg-white p-3.5">
            <Pill tone={c.tone}>{c.label}</Pill>
            <p className="num text-[26px] leading-10 font-bold text-ink">{c.value}</p>
            <p className="text-[10.5px] text-muted-foreground">{c.note}</p>
          </div>
        ))}
      </div>

      <Suspense fallback={null}>
        <QueueFilters materials={options.materials} printers={options.printers} />
      </Suspense>

      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <table className="w-full min-w-[980px] border-collapse text-[11px]">
          <thead>
            <tr className="bg-ground text-[10.5px] text-muted-foreground">
              <th className="px-2.5 py-2.5 text-left font-semibold">ジョブ</th>
              <th className="px-2.5 py-2.5 text-left font-semibold">作品 / サイズ</th>
              <th className="px-2.5 py-2.5 text-left font-semibold">素材・色</th>
              <th className="px-2.5 py-2.5 text-left font-semibold">推定 g / 時間</th>
              <th className="px-2.5 py-2.5 text-left font-semibold">パーツ</th>
              <th className="px-2.5 py-2.5 text-left font-semibold">プリンタ</th>
              <th className="px-2.5 py-2.5 text-left font-semibold">期限</th>
              <th className="px-2.5 py-2.5 text-left font-semibold">ステータス</th>
              <th className="px-2.5 py-2.5 text-left font-semibold">操作</th>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-[12px] text-muted-foreground">
                  条件に合うジョブはありません。
                </td>
              </tr>
            )}
            {jobs.map((job) => {
              const image = workImageUrl(job.thumbnail_path);
              const readyForQc = job.status === "printed" || job.status === "qc_failed";
              return (
                <tr
                  key={job.id}
                  className={`border-t border-line ${job.is_overdue ? "bg-danger-bg/50" : ""}`}
                >
                  <td className="num px-2.5 py-2.5 font-semibold text-brand">{job.job_no}</td>
                  <td className="px-2.5 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="flex size-7 flex-none items-center justify-center overflow-hidden rounded-md bg-ground">
                        {image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={image} alt="" className="size-full object-cover" />
                        ) : (
                          <ImageIcon className="size-3 text-line" aria-hidden />
                        )}
                      </span>
                      <span className="flex flex-col">
                        <span className="text-[11.5px] font-semibold text-ink">
                          {job.work_title ?? "（削除された作品）"}
                        </span>
                        <span className="num text-[10px] text-muted-foreground">
                          {job.size_label ?? "—"}
                          {job.quantity && job.quantity > 1 ? ` ×${job.quantity}` : ""}
                        </span>
                      </span>
                    </div>
                  </td>
                  <td className="px-2.5 py-2.5 text-ink">
                    {job.material ? (
                      <span className="flex items-center gap-1.5">
                        <span
                          className="size-2.5 flex-none rounded-full border border-line"
                          style={{ background: job.color_hex ?? "transparent" }}
                        />
                        {job.material}・{job.color_name}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">未割り当て</span>
                    )}
                  </td>
                  <td className="num px-2.5 py-2.5 text-ink">
                    {job.est_filament_grams ?? "—"}g / {job.est_print_hours ?? "—"}h
                  </td>
                  <td className="num px-2.5 py-2.5 text-ink">{job.part_count}</td>
                  <td className="num px-2.5 py-2.5 text-ink">
                    {job.printer_code ?? <span className="text-muted-foreground">—</span>}
                  </td>
                  <td
                    className={`num px-2.5 py-2.5 ${job.is_overdue ? "font-semibold text-danger" : "text-ink"}`}
                  >
                    {shortDateTime(job.due_at)}
                  </td>
                  <td className="px-2.5 py-2.5">
                    <JobStatusBadge status={job.status!} isOverdue={job.is_overdue} />
                  </td>
                  <td className="px-2.5 py-2.5">
                    <Link
                      href={
                        readyForQc
                          ? `/admin/print-queue/${job.id}/qc`
                          : `/admin/print-queue/${job.id}`
                      }
                      className={`inline-flex items-center rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                        readyForQc
                          ? "bg-brand text-white hover:opacity-90"
                          : "border border-line bg-white text-ink hover:bg-ground"
                      }`}
                    >
                      {readyForQc ? "検品" : "詳細"}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {summary.overdue > 0 && (
        <div className="flex items-center gap-2 rounded-xl bg-warn-bg px-3 py-2.5">
          <AlertTriangle className="size-3.5 text-warn" aria-hidden />
          <p className="text-[11px] text-warn">
            期限超過 {summary.overdue}件。出荷期限を過ぎたジョブがあります。優先度を上げてください。
          </p>
        </div>
      )}
    </>
  );
}
