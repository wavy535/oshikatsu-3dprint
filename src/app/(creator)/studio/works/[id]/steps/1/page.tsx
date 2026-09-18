import Link from "next/link";
import { notFound } from "next/navigation";

import { getAnalysisDraft } from "@/lib/works/studio-queries";
import { StepNav } from "@/components/studio/step-nav";
import { AssetUploader } from "@/components/studio/asset-uploader";
import { Button } from "@/components/ui/button";
import { AssetAnalysisCard } from "@/components/studio/asset-analysis-card";

export const metadata = { title: "STEP1 3Dデータ" };

/**
 * Figma ②出品フロー「STEP1 3Dデータ 2058:1033」。
 * 解析はアップロード直後にサーバー側で走り、結果は work_validation_issues に入る。
 */
export default async function Step1Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const work = await getAnalysisDraft(id);
  if (!work) notFound();

  const assets = work.work_assets ?? [];
  const base = work.work_variants?.find((v) => v.is_base);
  const failed = assets.some((asset) => asset.validation_status === "failed" || asset.validation_status === "pending");

  return (
    <>
      <div className="flex items-center gap-3">
        <h1 className="text-base font-bold text-ink">作品を投稿する</h1>
        <Link href="/studio/works" className="ml-auto text-[11.5px] text-brand hover:underline">
          作品管理へ戻る
        </Link>
      </div>

      <StepNav workId={work.id} current={1} />

      <AssetUploader workId={work.id} assets={assets} />

      {assets.length > 0 && (
        <>
          <section className="rounded-xl border border-line bg-white p-5">
            <h2 className="text-[13px] font-semibold">作品一式の原寸見積り</h2>
            <p className="num mt-2 text-[12.5px]">{assets.length}ファイル・{base?.part_count ?? "—"}パーツ ／ {base?.est_filament_grams ?? "—"} g ／ {base?.est_print_hours ?? "—"} 時間</p>
          </section>
          {assets.map((asset) => <AssetAnalysisCard key={asset.id} asset={asset} />)}

          <div className="flex items-center gap-3">
            {failed && (
              <p className="text-[12px] text-danger">
                エラーが残っています。データを直してから差し替えてください。
              </p>
            )}
            {failed ? <Button className="ml-auto" disabled>印刷指示へ進む</Button> : <Button asChild className="ml-auto">
              <Link href={`/studio/works/${work.id}/steps/2`}>印刷指示へ進む</Link>
            </Button>}
          </div>
        </>
      )}
    </>
  );
}
