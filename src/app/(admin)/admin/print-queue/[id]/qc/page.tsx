import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Gift } from "lucide-react";

import { getQcContext } from "@/lib/ops/printing-queries";
import { CARRIER_LABEL, REPRINT_CAUSE_LABEL, shortDateTime, yen } from "@/lib/ops/labels";
import { QcForm, ShipmentForm } from "@/components/ops/qc-form";
import { JobStatusBadge, Pill } from "@/components/ops/status-badge";

export const metadata = { title: "検品・発送登録" };

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-line bg-white p-3.5">
      <h2 className="text-[12.5px] font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value, warn }: { label: string; value: React.ReactNode; warn?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="flex-1 text-[11px] text-muted-foreground">{label}</span>
      <span className={`text-[11px] font-semibold ${warn ? "text-warn" : "text-ink"}`}>{value}</span>
    </div>
  );
}

/**
 * Figma ⑤運営オペレーション「検品・発送登録 2083:1233」。
 *
 * 検品NG（原因＝モデル側）はクリエイターへの修正依頼に、検品OKが全部そろえば
 * 発送登録に進む。どちらもここで書くのは記録だけで、ジョブと注文のステータスは
 * DBのトリガーが動かす（設計判断7・9）。
 */
export default async function QcPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getQcContext(id);
  if (!data) notFound();

  const { job, checks, inspections, order, siblings, allPassed, shipment } = data;
  const address = order?.addresses;
  const canInspect = job.status === "printed" || job.status === "qc_failed";

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/admin/print-queue"
          className="inline-flex items-center gap-1 rounded-md border border-line bg-white px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-ground"
        >
          <ChevronLeft className="size-3" aria-hidden />
          一覧へ戻る
        </Link>
        <p className="num text-[17px] font-bold text-ink">{job.job_no}</p>
        <p className="text-[17px] font-bold text-ink">
          {job.work_title ?? "（削除された作品）"}（{job.size_label ?? "—"}）
        </p>
        <JobStatusBadge status={job.status!} />
        <Link
          href={`/admin/print-queue/${job.id}`}
          className="ml-auto text-[11px] text-brand hover:underline"
        >
          ジョブ詳細へ
        </Link>
      </div>

      <div className="flex flex-col gap-4 xl:flex-row">
        {/* 左：注文情報 */}
        <div className="flex w-full flex-col gap-3 xl:w-72 xl:flex-none">
          <Card title="注文情報">
            <Row label="注文番号" value={<span className="num">#{job.order_id?.slice(0, 8)}</span>} />
            <Row label="購入者" value={order?.profiles?.display_name ?? job.buyer_name ?? "—"} />
            <Row
              label="お届け先"
              value={address ? `${address.prefecture} ${address.city}` : "—"}
            />
            <Row label="宛名" value={address?.recipient_name ?? "—"} />
            <Row
              label="出荷期限"
              value={<span className="num">{shortDateTime(order?.ship_due_at)}</span>}
            />
            <Row label="支払額" value={<span className="num">{yen(order?.total_amount)}</span>} />
            {order?.gift_wrapping && (
              <div className="flex items-center gap-1.5 rounded-lg bg-warn-bg px-2.5 py-1.5">
                <Gift className="size-3 text-warn" aria-hidden />
                <p className="text-[10.5px] font-semibold text-warn">ラッピング希望あり</p>
              </div>
            )}
          </Card>

          <Card title="この注文のほかのジョブ">
            {siblings.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                このジョブだけです。検品が通れば発送できます。
              </p>
            ) : (
              siblings.map((s) => (
                <div key={s.id} className="flex items-center gap-2">
                  <Link
                    href={`/admin/print-queue/${s.id}`}
                    className="num text-[11px] font-semibold text-brand hover:underline"
                  >
                    {s.job_no}
                  </Link>
                  <span className="flex-1 truncate text-[11px] text-ink">{s.work_title}</span>
                  <JobStatusBadge status={s.status!} />
                </div>
              ))
            )}
          </Card>

          {inspections.length > 0 && (
            <Card title="検品の履歴">
              {inspections.map((i) => (
                <div key={i.id} className="flex flex-col gap-1 border-b border-line pb-2 last:border-b-0">
                  <div className="flex items-center gap-2">
                    <Pill tone={i.result === "passed" ? "ok" : "danger"}>
                      {i.result === "passed" ? "合格" : "不合格"}
                    </Pill>
                    <span className="num text-[10.5px] text-muted-foreground">
                      {shortDateTime(i.created_at)}
                    </span>
                  </div>
                  {i.reprint_cause && (
                    <p className="text-[10.5px] text-danger">
                      原因：{REPRINT_CAUSE_LABEL[i.reprint_cause]}
                    </p>
                  )}
                  {i.memo && <p className="text-[10.5px] text-ink">{i.memo}</p>}
                  <p className="text-[10px] text-muted-foreground">
                    NG項目：
                    {i.qc_check_results.filter((r) => !r.passed).map((r) => r.code).join("・") ||
                      "なし"}
                    {i.photo_paths.length > 0 ? `／写真 ${i.photo_paths.length}枚` : ""}
                  </p>
                </div>
              ))}
            </Card>
          )}
        </div>

        {/* 中央：チェックリスト */}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {canInspect ? (
            <QcForm jobId={job.id!} workId={job.work_id} checks={checks} />
          ) : (
            <Card title="検品">
              <p className="text-[11px] text-muted-foreground">
                このジョブは
                {job.status === "qc_passed"
                  ? "検品を通っています。"
                  : "まだ印刷が終わっていません。印刷完了にしてから検品してください。"}
              </p>
            </Card>
          )}
        </div>

        {/* 右：発送登録 */}
        <div className="flex w-full flex-col gap-3 xl:w-80 xl:flex-none">
          <Card title="発送登録">
            {shipment ? (
              <div className="flex flex-col gap-1.5">
                <Row label="配送業者" value={CARRIER_LABEL[shipment.carrier]} />
                <Row label="配送方法" value={shipment.service_name ?? "—"} />
                <Row
                  label="追跡番号"
                  value={<span className="num">{shipment.tracking_number ?? "—"}</span>}
                />
                <Row
                  label="重量 / 三辺"
                  value={
                    <span className="num">
                      {shipment.weight_grams ?? "—"}g / {shipment.size_sum_cm ?? "—"}cm
                    </span>
                  }
                />
                <Row label="送料" value={<span className="num">{yen(shipment.shipping_fee_jpy)}</span>} />
                <Row
                  label="発送日時"
                  value={<span className="num">{shortDateTime(shipment.shipped_at)}</span>}
                />
                <p className="pt-1 text-[10.5px] text-ok">
                  発送済みです。購入者の注文詳細に追跡番号が出ています。
                </p>
              </div>
            ) : (
              <ShipmentForm
                orderId={job.order_id!}
                enabled={allPassed}
                giftWrapping={!!order?.gift_wrapping}
              />
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
