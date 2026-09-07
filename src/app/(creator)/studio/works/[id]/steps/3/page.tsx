import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireCreator } from "@/lib/auth/guards";
import { getWorkDraft, listTags } from "@/lib/works/studio-queries";
import { StepNav } from "@/components/studio/step-nav";
import { WorkInfoForm } from "@/components/studio/work-info-form";

export const metadata = { title: "STEP3 作品情報" };

/** Figma ②出品フロー「STEP3 作品情報」。 */
export default async function Step3Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireCreator();
  const [work, tags] = await Promise.all([getWorkDraft(id), listTags()]);
  if (!work) notFound();
  if (!work.work_assets?.length) redirect(`/studio/works/${id}/steps/1`);

  const [{ data: rule }, { data: pricing }] = await Promise.all([
    supabase
      .from("print_pricing_rules")
      .select("platform_fee_rate, fee_billing")
      .eq("is_active", true)
      .maybeSingle(),
    // 下限・支払額・受取額はビューが課金モデルに合わせて計算している
    supabase
      .from("work_variant_pricing")
      .select("id, min_price_jpy, buyer_total_jpy, creator_payout_jpy")
      .eq("work_id", id),
  ]);
  const pricingById = new Map((pricing ?? []).map((p) => [p.id, p] as const));

  const base = work.work_variants?.find((v) => v.is_base);
  const variants = [...(work.work_variants ?? [])]
    .sort((a, b) => (a.nui_size_cm ?? 0) - (b.nui_size_cm ?? 0))
    .map((v) => ({
      id: v.id,
      sizeLabel: v.size_label,
      scaleRatio: Number(v.scale_ratio),
      isBase: v.is_base,
      printFee: v.print_fee_jpy,
      grams: v.est_filament_grams,
      hours: v.est_print_hours,
      price: v.price_jpy,
      stock: v.stock,
      isListed: v.is_listed,
      isPrintable: v.is_printable,
      unprintableReason: v.unprintable_reason,
      floorPrice: pricingById.get(v.id)?.min_price_jpy ?? 100,
    }));

  return (
    <>
      <div className="flex items-center gap-3">
        <h1 className="text-base font-bold text-ink">作品を投稿する</h1>
        <Link href="/studio/works" className="ml-auto text-[11.5px] text-brand hover:underline">
          作品管理へ戻る
        </Link>
      </div>

      <StepNav workId={work.id} current={3} />

      <WorkInfoForm
        workId={work.id}
        tags={tags}
        variants={variants}
        platformFeeRate={Number(rule?.platform_fee_rate ?? 0.1)}
        feeBilling={rule?.fee_billing ?? "separate"}
        initial={{
          title: work.title,
          description: work.description ?? "",
          tagIds: (work.work_tags ?? []).map((t) => t.tag_id),
          accepts: {
            colorChange: work.accepts_color_change,
            mirror: work.accepts_mirror,
            standHole: work.accepts_stand_hole,
            customSize: work.accepts_custom_size,
            otherRequest: work.accepts_other_request,
          },
          fit: {
            widthMm: base?.fit_width_mm ?? null,
            heightMm: base?.fit_height_mm ?? null,
            depthMm: base?.fit_depth_mm ?? null,
          },
        }}
      />
    </>
  );
}
