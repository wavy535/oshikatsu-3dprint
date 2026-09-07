import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getWorkDraft, listFilaments } from "@/lib/works/studio-queries";
import { StepNav } from "@/components/studio/step-nav";
import { PrintInstructionsForm } from "@/components/studio/print-instructions-form";

export const metadata = { title: "STEP2 印刷指示" };

/** Figma ②出品フロー「STEP2 印刷指示」。 */
export default async function Step2Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [work, filaments] = await Promise.all([getWorkDraft(id), listFilaments()]);
  if (!work) notFound();

  const asset = work.work_assets?.[0];
  // 3Dデータが無いとパーツも無いので STEP1 へ戻す
  if (!asset) redirect(`/studio/works/${id}/steps/1`);

  const objectById = new Map(
    (asset.work_asset_objects ?? []).map((o) => [o.id, o])
  );

  const parts = (work.work_part_instructions ?? [])
    .filter((i) => i.variant_id === null && objectById.has(i.object_id))
    .map((i) => {
      const o = objectById.get(i.object_id)!;
      return {
        instructionId: i.id,
        name: o.name,
        bbox: `${o.bbox_x_mm} × ${o.bbox_y_mm} × ${o.bbox_z_mm} mm`,
        orientation: i.orientation,
        support: i.support,
        noRotate: i.no_rotate,
        note: i.note,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));

  const slots = (work.work_color_slots ?? [])
    .map((s) => ({
      id: s.id,
      slotIndex: s.slot_index,
      sourceName: s.source_name,
      sourceHex: s.source_hex,
      filamentId: s.filament_id,
    }))
    .sort((a, b) => a.slotIndex - b.slotIndex);

  return (
    <>
      <div className="flex items-center gap-3">
        <h1 className="text-base font-bold text-ink">作品を投稿する</h1>
        <Link href="/studio/works" className="ml-auto text-[11.5px] text-brand hover:underline">
          作品管理へ戻る
        </Link>
      </div>

      <StepNav workId={work.id} current={2} />

      <PrintInstructionsForm
        workId={work.id}
        parts={parts}
        slots={slots}
        filaments={filaments}
      />
    </>
  );
}
