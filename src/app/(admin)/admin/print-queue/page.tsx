import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import {
  getPrintQueueSummary,
  listPrintJobs,
  JOB_STATUS_LABEL,
  type PrintJobStatus,
} from "@/features/print-jobs/queries";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const metadata = { title: "印刷キュー" };

const FILTERS: { value: string; label: string }[] = [
  { value: "", label: "すべて" },
  { value: "queued", label: "未着手" },
  { value: "printing", label: "印刷中" },
  { value: "inspection", label: "検品待ち" },
  { value: "failed", label: "要対応" },
  { value: "done", label: "完了" },
];

const STATUSES: PrintJobStatus[] = ["queued", "printing", "inspection", "done", "failed"];

function formatDue(due: string | null) {
  if (!due) return { text: "—", overdue: false };
  const d = new Date(due);
  return {
    text: d.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" }),
    overdue: d.getTime() < Date.now(),
  };
}

export default async function PrintQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdmin();
  const { status } = await searchParams;
  const active = (STATUSES as string[]).includes(status ?? "")
    ? (status as PrintJobStatus)
    : undefined;

  const [summary, jobs] = await Promise.all([
    getPrintQueueSummary(),
    listPrintJobs(active),
  ]);

  const cards = [
    { label: "未着手", value: summary.queued, href: "/admin/print-queue?status=queued" },
    { label: "印刷中", value: summary.printing, href: "/admin/print-queue?status=printing" },
    {
      label: "検品待ち",
      value: summary.inspection,
      href: "/admin/print-queue?status=inspection",
    },
    { label: "期限超過", value: summary.overdue, href: "/admin/print-queue", danger: true },
  ];

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-semibold">印刷キュー</h1>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="flex flex-col gap-1 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/50"
          >
            <span className="text-[11px] text-muted-foreground">{c.label}</span>
            <span
              className={cn(
                "num text-2xl font-bold",
                c.danger && c.value > 0 ? "text-destructive" : "text-foreground"
              )}
            >
              {c.value}
            </span>
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.value || "all"}
            href={f.value ? `/admin/print-queue?status=${f.value}` : "/admin/print-queue"}
          >
            <Badge variant={(active ?? "") === f.value ? "default" : "outline"}>
              {f.label}
            </Badge>
          </Link>
        ))}
      </div>

      {jobs.length === 0 ? (
        <p className="rounded-xl border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          該当するジョブはありません
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>注文</TableHead>
                <TableHead>作品 / サイズ</TableHead>
                <TableHead>素材・色</TableHead>
                <TableHead className="text-right">推定</TableHead>
                <TableHead className="text-right">パーツ</TableHead>
                <TableHead>期限</TableHead>
                <TableHead>状態</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => {
                const due = formatDue(job.due_at);
                return (
                  <TableRow key={job.id}>
                    <TableCell className="num whitespace-nowrap">
                      <Link
                        href={`/admin/print-jobs/${job.id}`}
                        className="underline underline-offset-2"
                      >
                        {job.orders?.order_number}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{job.products?.title}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {job.nui_sizes?.label ?? job.order_items?.nui_size_label ?? "—"}
                          {job.order_items?.quantity
                            ? ` ×${job.order_items.quantity}`
                            : ""}
                          {job.profiles?.display_name
                            ? ` / ${job.profiles.display_name}`
                            : ""}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1.5 text-[12px]">
                        {job.order_items?.filament_color_hex && (
                          <span
                            className="size-2.5 rounded-full border border-border"
                            style={{ backgroundColor: job.order_items.filament_color_hex }}
                          />
                        )}
                        {job.order_items?.filament_name ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell className="num text-right whitespace-nowrap">
                      {job.est_weight_g ? `${job.est_weight_g}g` : "—"}
                      {job.est_print_min
                        ? ` / ${Math.round(job.est_print_min / 60)}h`
                        : ""}
                    </TableCell>
                    <TableCell className="num text-right">{job.part_count}</TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "num flex items-center gap-1 whitespace-nowrap",
                          due.overdue && job.status !== "done" && "text-destructive"
                        )}
                      >
                        {due.overdue && job.status !== "done" && (
                          <AlertTriangle className="size-3" aria-hidden />
                        )}
                        {due.text}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={job.status === "failed" ? "destructive" : "outline"}>
                        {JOB_STATUS_LABEL[job.status]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
