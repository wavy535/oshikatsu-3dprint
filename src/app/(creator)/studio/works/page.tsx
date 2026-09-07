import Link from "next/link";
import { ImageIcon, Package, Plus } from "lucide-react";

import { listMyWorks } from "@/lib/works/studio-queries";
import { createDraftWorkAction } from "@/lib/works/step-actions";
import { workImageUrl } from "@/lib/storage";
import { yen } from "@/components/work/work-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata = { title: "作品管理" };

const STATUS_LABEL: Record<string, string> = {
  draft: "下書き",
  published: "公開中",
  archived: "非公開",
};

const STATUS_TONE: Record<string, string> = {
  draft: "bg-warn-bg text-warn",
  published: "bg-ok-bg text-ok",
  archived: "bg-ground text-muted-foreground",
};

/** Figma ②出品フロー「作品管理」。下書きは続きのSTEPへ戻れる。 */
export default async function StudioWorksPage() {
  const works = await listMyWorks();

  return (
    <>
      <div className="flex items-center gap-3">
        <h1 className="text-base font-bold text-ink">作品管理</h1>
        <span className="num text-[12px] text-muted-foreground">{works.length}件</span>
        <form action={createDraftWorkAction} className="ml-auto">
          <Button type="submit" size="sm">
            <Plus className="size-4" aria-hidden />
            作品を投稿する
          </Button>
        </form>
      </div>

      {works.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-line bg-white px-6 py-16 text-center">
          <Package className="size-6 text-line" aria-hidden />
          <p className="text-sm font-semibold text-ink">作品がまだありません</p>
          <p className="text-[12px] text-muted-foreground">
            3Dデータをアップロードすると、印刷代行費と造形時間の見積りが自動で出ます。
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {works.map((w) => {
            const image = workImageUrl(
              [...(w.work_images ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0]
                ?.storage_path
            );
            const listed = (w.work_variants ?? []).filter((v) => v.is_listed);
            const hasAsset = (w.work_assets ?? []).length > 0;
            // 下書きは「どこまで進んだか」でSTEPを決める
            const step = !hasAsset ? 1 : listed.length === 0 ? 3 : 4;

            return (
              <div key={w.id} className="flex gap-3 rounded-xl border border-line bg-white p-4">
                <span className="size-20 shrink-0 overflow-hidden rounded-lg bg-ground">
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image} alt="" className="size-full object-cover" />
                  ) : (
                    <span className="flex size-full items-center justify-center">
                      <ImageIcon className="size-5 text-line" aria-hidden />
                    </span>
                  )}
                </span>

                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
                        STATUS_TONE[w.status]
                      )}
                    >
                      {STATUS_LABEL[w.status]}
                    </span>
                    <p className="truncate text-[13px] font-semibold text-ink">{w.title}</p>
                  </div>

                  <p className="text-[11px] text-muted-foreground">
                    {listed.length > 0 ? (
                      <>
                        出品中 <span className="num">{listed.length}</span>サイズ ／ 最安{" "}
                        <span className="num">{yen(w.min_price_jpy)}</span>
                      </>
                    ) : (
                      "出品中のサイズなし"
                    )}
                    {w.status === "published" && (
                      <>
                        {" "}／ いいね <span className="num">{w.favorite_count}</span>
                      </>
                    )}
                  </p>

                  <div className="mt-auto flex items-center gap-3">
                    <Link
                      href={`/studio/works/${w.id}/steps/${w.status === "draft" ? step : 3}`}
                      className="text-[11.5px] text-brand hover:underline"
                    >
                      {w.status === "draft" ? "続きから編集する" : "編集する"}
                    </Link>
                    {w.status === "published" && (
                      <Link
                        href={`/works/${w.id}`}
                        className="text-[11.5px] text-muted-foreground hover:text-ink"
                      >
                        公開ページを見る
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
