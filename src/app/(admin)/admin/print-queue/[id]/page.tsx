import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ChevronLeft, ImageIcon } from "lucide-react";

import { getPrintJob } from "@/lib/ops/printing-queries";
import { yen } from "@/lib/format";
import { JOB_STATUS_LABEL, ORIENTATION_LABEL, SUPPORT_LABEL, shortDateTime } from "@/lib/ops/labels";
import { workImageUrl } from "@/lib/storage";
import { JobControls, JobEditActualsForm, JobFinishForm } from "@/components/ops/job-controls";
import { JobStatusBadge } from "@/components/ops/status-badge";

export const metadata = { title: "印刷ジョブ" };

function Row({ label, value, danger }: { label: string; value: React.ReactNode; danger?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-[74px] flex-none text-[11px] text-muted-foreground">{label}</span>
      <span className={`text-[11px] font-semibold ${danger ? "text-danger" : "text-ink"}`}>
        {value}
      </span>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-line bg-white p-3.5">
      <h2 className="text-[12.5px] font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Figma ⑤運営オペレーション「印刷ジョブ詳細 2080:1219」。
 *
 * 印刷指示・色スロットはクリエイターが STEP2 で入れたものをそのまま出す
 * （運営はここでは書き換えない）。運営が入れるのは実績とプリンタの割り当て。
 */
export default async function PrintJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getPrintJob(id);
  if (!data) notFound();

  const { job, detail, events, printers, filaments, work, variant, slots, parts, printFiles } = data;
  const image = workImageUrl(job.thumbnail_path);
  const creatorName = work?.profiles?.display_name ?? "—";
  const primaryFilamentId = slots[0]?.filaments?.id ?? null;
  const readyForQc = job.status === "printed" || job.status === "qc_failed";

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/admin/print-queue"
          className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-ground"
        >
          <ChevronLeft className="size-3" aria-hidden />
          キューへ戻る
        </Link>
        <p className="num text-[17px] font-bold text-ink">{job.job_no}</p>
        <p className="text-[17px] font-bold text-ink">
          {job.work_title ?? "（削除された作品）"}（{job.size_label ?? "—"}）
        </p>
        <JobStatusBadge status={job.status!} isOverdue={job.is_overdue} />
        {(job.batch_count ?? 1) > 1 && (
          <p className="num text-[11px] text-muted-foreground">
            バッチ {job.batch_done} / {job.batch_count}
          </p>
        )}

        <div className="ml-auto flex items-center gap-2">
          <JobControls
            jobId={job.id!}
            status={job.status!}
            batchDone={job.batch_done ?? 0}
            batchCount={job.batch_count ?? 1}
            printers={printers}
            defaultPrinterId={job.printer_id}
          />
          {readyForQc && (
            <Link
              href={`/admin/print-queue/${job.id}/qc`}
              className="inline-flex items-center rounded-md bg-brand px-3 py-2 text-[11.5px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              検品へ進む
            </Link>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4 xl:flex-row">
        {/* 左：作品と基本情報 */}
        <div className="flex w-full flex-col gap-3 xl:w-72 xl:flex-none">
          <div className="flex h-40 items-center justify-center overflow-hidden rounded-xl border border-line bg-white">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="" className="size-full object-cover" />
            ) : (
              <ImageIcon className="size-5 text-line" aria-hidden />
            )}
          </div>

          {printFiles.length > 0 && <Card title="注文時の印刷用ファイル">
            <p className="text-[11px] text-muted-foreground">全{printFiles.length}ファイルで1作品分です。</p>
            {printFiles.map((file, index) => <a key={index} className="break-all py-2 text-[12px] text-brand underline" href={`/api/admin/print-jobs/${job.id}/files/${index}`}>
              {file.file_name}{file.scale_ratio ? `（倍率 ${file.scale_ratio}）` : ""}
            </a>)}
          </Card>}
          <Card title="基本情報">
            <Row label="注文番号" value={<span className="num">#{job.order_id?.slice(0, 8)}</span>} />
            <Row label="購入者" value={job.buyer_name ?? "—"} />
            <Row label="クリエイター" value={creatorName} />
            <Row
              label="受注日時"
              value={<span className="num">{shortDateTime(job.ordered_at)}</span>}
            />
            <Row
              label="出荷期限"
              danger={!!job.is_overdue}
              value={<span className="num">{shortDateTime(job.due_at)}</span>}
            />
            <Row
              label="プリンタ"
              value={job.printer_code ?? <span className="text-muted-foreground">未割り当て</span>}
            />
            <Row label="担当" value={job.assignee_name ?? "—"} />
            <Row
              label="造形サイズ"
              value={
                <span className="num">
                  {variant
                    ? `${variant.bbox_x_mm} × ${variant.bbox_y_mm} × ${variant.bbox_z_mm} mm`
                    : "—"}
                </span>
              }
            />
            <Row
              label="数量"
              value={<span className="num">{job.quantity} 個 / {job.part_count} パーツ</span>}
            />
            <Row
              label="代行費"
              value={<span className="num">{yen(detail?.print_fee_snapshot)}</span>}
            />
          </Card>
        </div>

        {/* 中央：印刷指示と履歴 */}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <Card title="印刷指示（クリエイター入力）">
            {parts.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                パーツごとの指示は登録されていません。データのままの向きで造形してください。
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[400px] border-collapse text-[11px]">
                  <thead>
                    <tr className="text-[10.5px] text-muted-foreground">
                      <th className="border-b border-line px-2 py-1.5 text-left font-semibold">
                        パーツ
                      </th>
                      <th className="border-b border-line px-2 py-1.5 text-left font-semibold">
                        推奨積層方向
                      </th>
                      <th className="border-b border-line px-2 py-1.5 text-left font-semibold">
                        サポート
                      </th>
                      <th className="border-b border-line px-2 py-1.5 text-left font-semibold">
                        最小肉厚
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {parts.map((p) => (
                      <tr key={p.id} className="border-b border-line last:border-b-0">
                        <td className="px-2 py-1.5 font-semibold text-ink">
                          {p.work_asset_objects?.name ?? "—"}
                          {p.note && (
                            <span className="block text-[10px] font-normal text-warn">{p.note}</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-ink">{ORIENTATION_LABEL[p.orientation]}</td>
                        <td
                          className={`px-2 py-1.5 ${p.support === "none" ? "text-ink" : "font-semibold text-warn"}`}
                        >
                          {SUPPORT_LABEL[p.support]}
                          {p.support_note && (
                            <span className="block text-[10px] font-normal text-muted-foreground">
                              {p.support_note}
                            </span>
                          )}
                        </td>
                        <td className="num px-2 py-1.5 text-ink">
                          {p.work_asset_objects?.min_wall_thickness_mm ?? "—"} mm
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {parts.some((p) => p.note) && (
              <div className="flex items-start gap-2 rounded-lg bg-warn-bg px-2.5 py-2">
                <AlertTriangle className="mt-0.5 size-3 flex-none text-warn" aria-hidden />
                <p className="text-[10.5px] text-warn">
                  クリエイターの注記があります。向きを変えて刷らないでください。
                </p>
              </div>
            )}
          </Card>

          <Card title="進捗の履歴">
            {events.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">まだ記録がありません。</p>
            ) : (
              <ol className="flex flex-col gap-1.5">
                {events.map((e) => (
                  <li key={e.id} className="flex items-center gap-2 text-[11px]">
                    <span className="num w-[86px] flex-none text-muted-foreground">
                      {shortDateTime(e.created_at)}
                    </span>
                    <span className="font-semibold text-ink">{JOB_STATUS_LABEL[e.status]}</span>
                    {e.note && <span className="text-muted-foreground">{e.note}</span>}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        {/* 右：色スロットと実績 */}
        <div className="flex w-full flex-col gap-3 xl:w-80 xl:flex-none">
          <Card title="色・素材スロット">
            {slots.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                色スロットが割り当てられていません。
              </p>
            ) : (
              slots.map((s) => (
                <div
                  key={s.slot_index}
                  className="flex items-center gap-2.5 rounded-lg bg-ground px-2.5 py-2"
                >
                  <span
                    className="size-4 flex-none rounded-full border border-line"
                    style={{ background: s.filaments?.color_hex ?? s.source_hex }}
                  />
                  <div className="flex flex-col">
                    <p className="text-[11.5px] font-semibold text-ink">
                      スロット{s.slot_index}：{s.source_name}
                      {s.filaments ? `　${s.filaments.material} ${s.filaments.color_name}` : ""}
                    </p>
                    <p className="num text-[10px] text-muted-foreground">
                      {s.filaments
                        ? `在庫 ${(s.filaments.stock_grams / 1000).toFixed(1)} kg`
                        : "フィラメント未割り当て"}
                    </p>
                  </div>
                </div>
              ))
            )}
          </Card>

          <Card title="印刷実績の記録">
            {job.status === "printing" || job.status === "reprinting" ? (
              <JobFinishForm
                jobId={job.id!}
                estGrams={job.est_filament_grams}
                estHours={job.est_print_hours}
                filaments={filaments}
                defaultFilamentId={primaryFilamentId}
              />
            ) : (
              <div className="flex flex-col gap-1.5">
                <Row
                  label="推定"
                  value={
                    <span className="num">
                      {job.est_filament_grams ?? "—"}g / {job.est_print_hours ?? "—"}h
                    </span>
                  }
                />
                <Row
                  label="実績"
                  value={
                    <span className="num">
                      {job.actual_filament_grams ?? "—"}g / {job.actual_print_hours ?? "—"}h
                    </span>
                  }
                />
                <Row label="失敗" value={<span className="num">{job.failure_count} 回</span>} />
                {job.status === "queued" ? (
                  <p className="pt-1 text-[10.5px] text-muted-foreground">印刷を開始すると実績を入力できます。</p>
                ) : (
                  <JobEditActualsForm
                    jobId={job.id!}
                    actualGrams={job.actual_filament_grams}
                    actualHours={job.actual_print_hours}
                    failureCount={job.failure_count ?? 0}
                  />
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
