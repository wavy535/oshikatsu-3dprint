import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/guards";
import { getPrintJob, JOB_STATUS_LABEL } from "@/features/print-jobs/queries";
import { listFilaments } from "@/features/products/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { JobActions } from "./job-actions";

export const metadata = { title: "印刷ジョブ詳細" };

const LAYER_LABEL: Record<string, string> = {
  auto: "おまかせ",
  z_up: "Z軸 上向き",
  z_down: "Z軸 下向き",
  x_flat: "寝かせて配置",
};
const SUPPORT_LABEL: Record<string, string> = {
  auto: "おまかせ",
  none: "サポートなし",
  normal: "通常サポート",
  tree: "ツリーサポート",
};

export default async function PrintJobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireAdmin();
  const [job, filaments] = await Promise.all([getPrintJob(id), listFilaments()]);
  if (!job) notFound();

  const parts = [...(job.products?.product_assets ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/admin/print-queue"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← 印刷キュー
        </Link>
        <h1 className="text-xl font-semibold">{job.products?.title}</h1>
        <Badge variant={job.status === "failed" ? "destructive" : "outline"}>
          {JOB_STATUS_LABEL[job.status]}
        </Badge>
        {job.status === "inspection" && (
          <Button
            render={<Link href={`/admin/print-jobs/${job.id}/inspection`} />}
            size="sm"
            className="ml-auto"
          >
            検品・発送登録へ
          </Button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <dl className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-[13px]">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">注文番号</dt>
            <dd className="num">
              <Link
                href={`/admin/orders/${job.orders?.id}`}
                className="underline underline-offset-2"
              >
                {job.orders?.order_number}
              </Link>
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">サイズ</dt>
            <dd>{job.nui_sizes?.label ?? job.order_items?.nui_size_label ?? "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">数量</dt>
            <dd className="num">{job.order_items?.quantity ?? 1}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">クリエイター</dt>
            <dd>{job.profiles?.display_name}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">お届け先</dt>
            <dd>
              {job.orders?.ship_prefecture}
              {job.orders?.ship_city}
            </dd>
          </div>
        </dl>

        <dl className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-[13px]">
          <p className="font-semibold">色スロット・スライス設定</p>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">指定色</dt>
            <dd className="flex items-center gap-1.5">
              {job.order_items?.filament_color_hex && (
                <span
                  className="size-2.5 rounded-full border border-border"
                  style={{ backgroundColor: job.order_items.filament_color_hex }}
                />
              )}
              {job.order_items?.filament_name ?? "—"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">造形サイズ</dt>
            <dd className="num">
              {job.products?.size_w_mm ?? "—"}×{job.products?.size_d_mm ?? "—"}×
              {job.products?.size_h_mm ?? "—"}mm
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">推定重量 / 時間</dt>
            <dd className="num">
              {job.est_weight_g ?? "—"}g /{" "}
              {job.est_print_min ? `${Math.round(job.est_print_min / 60)}h` : "—"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">実績</dt>
            <dd className="num">
              {job.actual_weight_g != null ? `${job.actual_weight_g}g` : "—"} /{" "}
              {job.actual_print_min != null ? `${job.actual_print_min}分` : "—"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">期限</dt>
            <dd className="num">
              {job.due_at ? new Date(job.due_at).toLocaleDateString("ja-JP") : "—"}
            </dd>
          </div>
        </dl>

        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-[13px]">
          <p className="font-semibold">クリエイターの出力メモ</p>
          <p className="leading-5 whitespace-pre-wrap text-muted-foreground">
            {job.products?.print_note || "（なし）"}
          </p>
          {job.note && (
            <>
              <p className="mt-2 font-semibold">作業メモ</p>
              <p className="leading-5 whitespace-pre-wrap text-muted-foreground">
                {job.note}
              </p>
            </>
          )}
        </div>
      </div>

      {/* STEP2 の印刷指示 */}
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-semibold">
          印刷指示（STEP2 でクリエイターが入力した内容）
        </p>
        {parts.length === 0 ? (
          <p className="py-4 text-center text-[13px] text-muted-foreground">
            パーツが登録されていません
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12.5px]">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1.5 font-medium">パーツ</th>
                  <th className="py-1.5 font-medium">個数</th>
                  <th className="py-1.5 font-medium">積層方向</th>
                  <th className="py-1.5 font-medium">サポート</th>
                  <th className="py-1.5 font-medium">色スロット</th>
                  <th className="py-1.5 font-medium">指示</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {parts.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2">
                      <div className="flex flex-col">
                        <span className="font-medium">{p.part_label || "（無題）"}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {p.original_name}
                        </span>
                      </div>
                    </td>
                    <td className="num py-2">{p.quantity_per_item}</td>
                    <td className="py-2">{LAYER_LABEL[p.layer_direction ?? "auto"]}</td>
                    <td className="py-2">{SUPPORT_LABEL[p.support_type ?? "auto"]}</td>
                    <td className="py-2">
                      {p.color_slot ? (
                        <span className="flex items-center gap-1.5">
                          スロット{p.color_slot}
                          {p.filaments && (
                            <>
                              <span
                                className="size-2.5 rounded-full border border-border"
                                style={{ backgroundColor: p.filaments.color_hex }}
                              />
                              {p.filaments.name}
                            </>
                          )}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 text-muted-foreground">{p.print_note || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <JobActions
        jobId={job.id}
        status={job.status}
        filaments={filaments}
        estWeightG={job.est_weight_g}
        estPrintMin={job.est_print_min}
      />

      {job.print_job_inspections.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-semibold">検品履歴</p>
          <ul className="flex flex-col divide-y divide-border">
            {job.print_job_inspections.map((ins) => (
              <li key={ins.id} className="flex flex-col gap-0.5 py-2 text-[12.5px]">
                <span className="flex items-center gap-2">
                  <Badge variant={ins.result === "pass" ? "outline" : "destructive"}>
                    {ins.result === "pass"
                      ? "合格"
                      : ins.result === "fail_model"
                        ? "NG（モデル側）"
                        : "NG（印刷側）"}
                  </Badge>
                  <span className="num text-muted-foreground">
                    {new Date(ins.created_at).toLocaleString("ja-JP")}
                  </span>
                </span>
                {ins.comment && (
                  <span className="text-muted-foreground">{ins.comment}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
