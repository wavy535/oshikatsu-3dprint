import { Pagination } from "@/components/ui/pagination";
import Link from "next/link";
import { AlertTriangle, ImageIcon, Wrench } from "lucide-react";

import { listMyRevisions } from "@/lib/revisions/queries";
import { REVISION_STATUS_LABEL } from "@/lib/revisions/labels";
import { yen } from "@/lib/format";
import { REPRINT_CAUSE_LABEL, shortDateTime } from "@/lib/ops/labels";
import { workImageUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";

export const metadata = { title: "修正依頼" };

const STATUS_TONE: Record<string, string> = {
  open: "bg-danger-bg text-danger",
  in_progress: "bg-warn-bg text-warn",
  disputed: "bg-brand-soft text-brand",
  resolved: "bg-ok-bg text-ok",
  cancelled: "bg-ground text-muted-foreground",
};

/**
 * Figma ②出品フロー「作品の修正依頼」の一覧。
 * 検品NG（原因＝モデル側）で運営が起こした依頼が並ぶ。未対応・対応中を先に出す。
 */
export default async function StudioRevisionsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const sp = await searchParams;
  const { items: revisions, page, hasNext } = await listMyRevisions(sp.page);
  const open = revisions.filter((r) => r.status === "open" || r.status === "in_progress");

  return (
    <>
      <div className="flex items-center gap-3">
        <h1 className="text-base font-bold text-ink">修正依頼</h1>
        <span className="num text-[12px] text-muted-foreground">
          このページ {revisions.length}件{open.length > 0 ? `（要対応 ${open.length}）` : ""}
        </span>
      </div>

      {open.length > 0 && (
        <div className="flex items-center gap-2 rounded-xl bg-danger-bg px-3 py-2.5">
          <AlertTriangle className="size-3.5 text-danger" aria-hidden />
          <p className="text-[11.5px] text-danger">
            対応が終わるまで該当サイズは出品停止です。期限を過ぎると既存の注文は運営がキャンセルの連絡をします。
          </p>
        </div>
      )}

      {revisions.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-line bg-white px-6 py-16 text-center">
          <Wrench className="size-6 text-line" aria-hidden />
          <p className="text-sm font-semibold text-ink">このページに表示する修正依頼はありません</p>
          <p className="text-[12px] text-muted-foreground">
            検品でデータ側の問題が見つかったときに、ここへ運営からの依頼が届きます。
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {revisions.map((r) => {
            const image = workImageUrl(
              [...(r.works?.work_images ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0]
                ?.storage_path
            );
            const overdue = (r.status === "open" || r.status === "in_progress") && new Date(r.due_at) < new Date();
            return (
              <Link
                prefetch={false}
                key={r.id}
                href={`/studio/revisions/${r.id}`}
                className="flex items-center gap-4 rounded-xl border border-line bg-white p-4 transition-shadow hover:shadow-md"
              >
                <span className="flex size-14 flex-none items-center justify-center overflow-hidden rounded-lg bg-ground">
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img loading="lazy" src={image} alt="" className="size-full object-cover" />
                  ) : (
                    <ImageIcon className="size-5 text-line" aria-hidden />
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="num text-[11px] font-semibold text-brand">{r.revision_no}</span>
                    <span className="truncate text-[13px] font-semibold text-ink">
                      {r.works?.title ?? "（削除された作品）"}
                    </span>
                    <span className="num text-[11px] text-muted-foreground">{r.work_variants?.size_label}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-semibold", STATUS_TONE[r.status])}>
                      {REVISION_STATUS_LABEL[r.status]}
                    </span>
                  </span>
                  <span className="line-clamp-1 text-[11.5px] text-muted-foreground">{r.message}</span>
                  <span className="flex flex-wrap gap-3 text-[10.5px] text-muted-foreground">
                    <span>原因：{REPRINT_CAUSE_LABEL[r.cause]}</span>
                    <span className={cn("num", overdue && "font-semibold text-danger")}>
                      期限 {shortDateTime(r.due_at)}
                    </span>
                    {r.charged_to_creator && (
                      <span className="num text-danger">再印刷の代行費 {yen(r.reprint_fee_jpy)}（クリエイター負担）</span>
                    )}
                    {r.work_variants && !r.work_variants.is_listed && (
                      <span className="text-warn">出品停止中</span>
                    )}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
      <Pagination path="/studio/revisions" params={sp} page={page} hasNext={hasNext} />
    </>
  );
}
