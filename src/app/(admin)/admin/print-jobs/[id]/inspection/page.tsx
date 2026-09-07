import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/guards";
import { getPrintJob } from "@/features/print-jobs/queries";
import { InspectionForm } from "./inspection-form";

export const metadata = { title: "検品・発送登録" };

export default async function InspectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireAdmin();
  const job = await getPrintJob(id);
  if (!job) notFound();

  // 同じ注文の他のジョブが全部済んでいれば発送登録に進める
  const { data: siblings } = await supabase
    .from("print_jobs")
    .select("id, status")
    .eq("order_id", job.order_id);
  const othersDone = (siblings ?? [])
    .filter((s) => s.id !== job.id)
    .every((s) => s.status === "done");
  const alreadyInspected = job.status === "done";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`/admin/print-jobs/${job.id}`}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← ジョブ詳細
        </Link>
        <h1 className="text-xl font-semibold">検品・発送登録</h1>
      </div>

      <dl className="grid gap-2 rounded-xl border border-border bg-card p-4 text-[13px] sm:grid-cols-4">
        <div className="flex flex-col">
          <dt className="text-[11px] text-muted-foreground">作品</dt>
          <dd>{job.products?.title}</dd>
        </div>
        <div className="flex flex-col">
          <dt className="text-[11px] text-muted-foreground">サイズ / 数量</dt>
          <dd className="num">
            {job.nui_sizes?.label ?? "—"} ×{job.order_items?.quantity ?? 1}
          </dd>
        </div>
        <div className="flex flex-col">
          <dt className="text-[11px] text-muted-foreground">注文番号</dt>
          <dd className="num">{job.orders?.order_number}</dd>
        </div>
        <div className="flex flex-col">
          <dt className="text-[11px] text-muted-foreground">お届け先</dt>
          <dd>
            {job.orders?.ship_recipient_name}（{job.orders?.ship_prefecture}
            {job.orders?.ship_city}）
          </dd>
        </div>
      </dl>

      <InspectionForm
        jobId={job.id}
        orderId={job.order_id}
        canRegisterShipment={othersDone && job.orders?.status === "printing"}
        alreadyInspected={alreadyInspected}
      />
    </div>
  );
}
