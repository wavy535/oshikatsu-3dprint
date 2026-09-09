import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";

import { getWorkDraft } from "@/lib/works/studio-queries";
import { StepNav } from "@/components/studio/step-nav";
import { ThumbnailPicker } from "@/components/studio/thumbnail-picker";
import { yen } from "@/components/work/work-card";
import { cn } from "@/lib/utils";

export const metadata = { title: "STEP4 公開" };

/** Figma ②出品フロー「STEP4 公開」。公開の条件を満たしているかをここで見せる。 */
export default async function Step4Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const work = await getWorkDraft(id);
  if (!work) notFound();
  if (!work.work_assets?.length) redirect(`/studio/works/${id}/steps/1`);

  const images = [...(work.work_images ?? [])]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((i) => ({ id: i.id, storagePath: i.storage_path, sortOrder: i.sort_order ?? 0 }));

  const listed = (work.work_variants ?? []).filter((v) => v.is_listed && v.price_jpy !== null);
  const failed = (work.work_assets ?? []).some((a) => a.validation_status === "failed");

  const checks = [
    { ok: !failed, label: "3Dデータの検証にエラーが無い" },
    { ok: work.title !== "無題の作品" && work.title.length > 0, label: "作品名を入力した" },
    { ok: listed.length > 0, label: "出品するサイズと価格を決めた" },
    { ok: images.length > 0, label: "画像を1枚以上登録した" },
  ];

  return (
    <>
      <div className="flex items-center gap-3">
        <h1 className="text-base font-bold text-ink">作品を投稿する</h1>
        <Link href="/studio/works" className="ml-auto text-[11.5px] text-brand hover:underline">
          作品管理へ戻る
        </Link>
      </div>

      <StepNav workId={work.id} current={4} />

      <section className="flex flex-col gap-2 rounded-xl border border-line bg-white p-5">
        <h2 className="text-[13px] font-semibold text-ink">公開の条件</h2>
        <ul className="flex flex-col gap-1.5">
          {checks.map((c) => (
            <li key={c.label} className="flex items-center gap-2 text-[12.5px]">
              {c.ok ? (
                <CheckCircle2 className="size-4 text-ok" aria-hidden />
              ) : (
                <XCircle className="size-4 text-danger" aria-hidden />
              )}
              <span className={cn(c.ok ? "text-ink" : "text-danger")}>{c.label}</span>
            </li>
          ))}
        </ul>
        {listed.length > 0 && (
          <p className="mt-1 text-[11.5px] text-muted-foreground">
            出品中（作品価格）: {listed.map((v) => `${v.size_label} ${yen(v.price_jpy)}`).join(" ／ ")}
            <br />
            買う人の支払額は、ここに印刷代行費が上乗せされた金額になります。
          </p>
        )}
      </section>

      <ThumbnailPicker
        workId={work.id}
        images={images}
        isPublished={work.status === "published"}
      />
    </>
  );
}
