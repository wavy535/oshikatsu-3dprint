import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ChevronLeft, ImageIcon } from "lucide-react";

import { getMyRevision } from "@/lib/revisions/queries";
import { REVISION_STATUS_LABEL } from "@/lib/revisions/labels";
import { REPRINT_CAUSE_LABEL, shortDateTime, yen } from "@/lib/ops/labels";
import { RevisionActions } from "@/components/revision/revision-actions";

export const metadata = { title: "修正依頼" };

function Row({ label, value, danger }: { label: string; value: React.ReactNode; danger?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="flex-1 text-[11px] text-muted-foreground">{label}</span>
      <span className={`text-[11px] font-semibold ${danger ? "text-danger" : "text-ink"}`}>{value}</span>
    </div>
  );
}

/**
 * Figma ②出品フロー「作品の修正依頼 2124:1628」。
 * 運営の検品NG（原因＝モデル側）がそのまま届く。写真・メモ・STEP1の検証値を見て、
 * 対応方法（データ差し替え／指示変更／出品停止）を選ぶ。
 */
export default async function RevisionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getMyRevision(id);
  if (!data) notFound();

  const { revision: r, inspection, job, objects, pendingJobCount, photos } = data;
  const variant = r.work_variants;
  const overdue = (r.status === "open" || r.status === "in_progress") && new Date(r.due_at) < new Date();
  const failedChecks = (inspection?.qc_check_results ?? [])
    .filter((c) => !c.passed)
    .map((c) => c.qc_check_definitions?.label ?? c.code);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/studio/revisions"
          className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-ground"
        >
          <ChevronLeft className="size-3" aria-hidden />
          一覧へ
        </Link>
        <p className="num text-[15px] font-bold text-brand">{r.revision_no}</p>
        <h1 className="text-[15px] font-bold text-ink">
          {r.works?.title ?? "（削除された作品）"}（{variant?.size_label ?? "—"}）
        </h1>
        <span className="rounded-full bg-ground px-2 py-0.5 text-[10.5px] font-semibold text-ink">
          {REVISION_STATUS_LABEL[r.status]}
        </span>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {/* 検品NGの通知そのもの */}
          <section className="flex flex-col gap-2.5 rounded-xl border border-danger/40 bg-danger-bg p-4">
            <p className="text-[12.5px] font-semibold text-danger">検品で不合格になりました</p>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-white px-2 py-0.5 text-[10.5px] font-semibold text-danger">
                原因：{REPRINT_CAUSE_LABEL[r.cause]}
              </span>
              {failedChecks.length > 0 && (
                <span className="rounded-full bg-white px-2 py-0.5 text-[10.5px] font-semibold text-danger">
                  NG項目：{failedChecks.join("・")}
                </span>
              )}
              {job && (
                <span className="num rounded-full bg-white px-2 py-0.5 text-[10.5px] font-semibold text-danger">
                  該当ジョブ：{job.job_no}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1 rounded-lg bg-white px-3 py-2">
              <div className="flex items-baseline gap-2">
                <span className="text-[10.5px] font-semibold text-ink">
                  検品担当 {inspection?.profiles?.display_name ?? "運営"}
                </span>
                <span className="num text-[9.5px] text-muted-foreground">
                  {shortDateTime(inspection?.created_at ?? r.created_at)}
                </span>
              </div>
              <p className="text-[11.5px] leading-4 text-ink">{r.message}</p>
            </div>
            {photos.length > 0 && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {photos.map((p) =>
                  p.url ? (
                    <a
                      key={p.path}
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-20 items-center justify-center overflow-hidden rounded-lg border border-line bg-white"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt="検品写真" className="size-full object-cover" />
                    </a>
                  ) : (
                    <span key={p.path} className="flex h-20 items-center justify-center rounded-lg border border-line bg-white">
                      <ImageIcon className="size-4 text-line" aria-hidden />
                    </span>
                  )
                )}
              </div>
            )}
          </section>

          {/* STEP1 の検証値 */}
          <section className="flex flex-col gap-2 rounded-xl border border-line bg-white p-4">
            <h2 className="text-[12.5px] font-semibold text-ink">STEP1 の検証値（パーツごと）</h2>
            {objects.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">3Dデータの解析結果がありません。</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse text-[11px]">
                  <thead>
                    <tr className="text-[10.5px] text-muted-foreground">
                      <th className="border-b border-line px-2 py-1.5 text-left font-semibold">パーツ</th>
                      <th className="border-b border-line px-2 py-1.5 text-left font-semibold">寸法 (mm)</th>
                      <th className="border-b border-line px-2 py-1.5 text-left font-semibold">最小肉厚</th>
                      <th className="border-b border-line px-2 py-1.5 text-left font-semibold">面の重なり</th>
                      <th className="border-b border-line px-2 py-1.5 text-left font-semibold">判定</th>
                    </tr>
                  </thead>
                  <tbody>
                    {objects.map((o) => {
                      const flagged = o.id === r.object_id;
                      const thin = o.min_wall_thickness_mm !== null && Number(o.min_wall_thickness_mm) < 1.0;
                      return (
                        <tr key={o.id} className={`border-b border-line last:border-b-0 ${flagged ? "bg-danger-bg" : ""}`}>
                          <td className={`px-2 py-1.5 font-semibold ${flagged ? "text-danger" : "text-ink"}`}>{o.name}</td>
                          <td className="num px-2 py-1.5 text-ink">
                            {o.bbox_x_mm} × {o.bbox_y_mm} × {o.bbox_z_mm}
                          </td>
                          <td className={`num px-2 py-1.5 ${thin ? "font-semibold text-danger" : "text-ink"}`}>
                            {o.min_wall_thickness_mm ?? "—"} mm
                          </td>
                          <td className="num px-2 py-1.5 text-ink">{o.self_intersection_count}</td>
                          <td className="px-2 py-1.5">
                            {flagged ? (
                              <span className="rounded-full bg-white px-2 py-0.5 text-[10.5px] font-semibold text-danger">要修正</span>
                            ) : thin || !o.is_manifold ? (
                              <span className="rounded-full bg-warn-bg px-2 py-0.5 text-[10.5px] font-semibold text-warn">注意</span>
                            ) : (
                              <span className="rounded-full bg-ok-bg px-2 py-0.5 text-[10.5px] font-semibold text-ok">OK</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-[10px] text-muted-foreground">
              はめ合いのクリアランスは自動検証では見つけられません（実際に組んだ運営からの指摘です）。
            </p>
          </section>

          <RevisionActions
            id={r.id}
            status={r.status}
            resolution={r.resolution}
            workId={r.work_id}
            isListed={variant?.is_listed ?? false}
          />
        </div>

        <div className="flex w-full flex-col gap-3 lg:w-80 lg:flex-none">
          <section className="flex flex-col gap-1.5 rounded-xl border border-line bg-white p-4">
            <h2 className="text-[12.5px] font-semibold text-ink">状況</h2>
            <Row label="作品" value={r.works?.title ?? "—"} />
            <Row label="サイズ" value={variant?.size_label ?? "—"} />
            <Row label="発生" value={<span className="num">{shortDateTime(r.created_at)}</span>} />
            <Row label="対応期限" danger={overdue} value={<span className="num">{shortDateTime(r.due_at)}</span>} />
            <Row label="再印刷" value={<span className="num">{(job?.failure_count ?? 0) + 0} 回目</span>} />
            {r.resolved_at && (
              <Row label="対応日時" value={<span className="num">{shortDateTime(r.resolved_at)}</span>} />
            )}
          </section>

          <section className="flex flex-col gap-1.5 rounded-xl border border-line bg-white p-4">
            <h2 className="text-[12.5px] font-semibold text-ink">いま止まっているもの</h2>
            {variant && !variant.is_listed && (
              <div className="flex items-center gap-1.5 rounded-lg bg-warn-bg px-2.5 py-1.5">
                <AlertTriangle className="size-3 text-warn" aria-hidden />
                <p className="text-[10.5px] font-semibold text-warn">
                  {variant.size_label} は出品停止になっています
                </p>
              </div>
            )}
            <Row label="印刷待ちの注文" value={<span className="num">{pendingJobCount} 件</span>} />
            <p className="text-[10px] text-muted-foreground">
              既存の注文は運営が購入者に連絡します。修正が終わったら再出品できます。
            </p>
          </section>

          <section className="flex flex-col gap-1.5 rounded-xl border border-line bg-white p-4">
            <h2 className="text-[12.5px] font-semibold text-ink">再印刷の費用</h2>
            <Row
              label="再印刷の代行費"
              danger={r.charged_to_creator}
              value={<span className="num text-[14px]">{yen(r.reprint_fee_jpy)}</span>}
            />
            <p className="text-[10px] text-muted-foreground">
              {r.charged_to_creator
                ? "原因が「モデル側」と判定されたため、この分はクリエイター負担になります。次回の受取額から差し引かれます。"
                : "運営負担です。"}
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
