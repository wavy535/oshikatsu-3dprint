import Link from "next/link";
import { notFound } from "next/navigation";
import { Check } from "lucide-react";

import { getCustomRequestTarget } from "@/lib/custom-orders/queries";
import { Avatar } from "@/components/ui/avatar";
import { CustomRequestForm } from "@/components/custom-orders/request-form";

export const metadata = { title: "オーダーメイド相談" };

/**
 * Figma ③やりとり「オーダーメイド相談フォーム 48:900」。
 * 作品ページの「オーダーメイド相談」から `?creator=&work=` で来る。
 */
export default async function NewCustomRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ creator?: string; work?: string }>;
}) {
  const sp = await searchParams;
  if (!sp.creator) notFound();
  const { creator, work } = await getCustomRequestTarget(sp.creator, sp.work);
  if (!creator) notFound();

  const customizations = work
    ? [
        { ok: work.accepts_color_change, label: "フィラメントカラー変更" },
        { ok: work.accepts_stand_hole, label: "設置用スタンドホール" },
        { ok: work.accepts_custom_size, label: "サイズのカスタム" },
        { ok: work.accepts_mirror, label: "配置反転" },
        { ok: work.accepts_other_request, label: "その他ご相談" },
      ]
    : [];

  return (
    <>
      <h1 className="text-base font-bold text-ink">オーダーメイド相談</h1>

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4 rounded-xl border border-line bg-white p-5">
          <div className="flex items-center gap-3 rounded-lg bg-ground px-3.5 py-3">
            <Avatar src={creator.avatar_url} name={creator.display_name} className="size-11" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[13px] font-semibold text-ink">相談先クリエイター：{creator.display_name}</span>
              <span className="truncate text-[10.5px] text-muted-foreground">
                {work ? `参考作品：${work.title}` : creator.bio || "クリエイター"}
              </span>
            </span>
            {work && (
              <Link href={`/works/${work.id}`} className="rounded-md border border-line bg-white px-2.5 py-1.5 text-[11px] text-ink hover:bg-ground">
                作品を見る
              </Link>
            )}
          </div>
          <CustomRequestForm creatorId={creator.id} workId={work?.id} />
        </div>

        <aside className="flex w-full flex-col gap-3 lg:w-[300px] lg:flex-none">
          {work && (
            <section className="flex flex-col gap-2 rounded-xl border border-line bg-white p-4">
              <h2 className="text-[12px] font-semibold text-ink">対応可能なカスタマイズ</h2>
              {customizations.map((c) => (
                <p key={c.label} className={`flex items-center gap-2 text-[11px] ${c.ok ? "text-ink" : "text-muted-foreground line-through"}`}>
                  <Check className={`size-3.5 ${c.ok ? "text-ok" : "text-line"}`} aria-hidden />
                  {c.label}
                </p>
              ))}
            </section>
          )}
          <section className="flex flex-col gap-2.5 rounded-xl border border-line bg-white p-4">
            <h2 className="text-[12px] font-semibold text-ink">相談から購入までの流れ</h2>
            {[
              ["相談を送信", "クリエイターにメッセージが届きます"],
              ["見積り・仕様調整", "メッセージ画面でやり取りします"],
              ["専用ページから購入", "承認後、通常のカート・決済に乗ります。運営が印刷・発送します"],
            ].map(([t, d], i) => (
              <div key={t} className="flex items-start gap-2.5">
                <span className="num flex size-5 flex-none items-center justify-center rounded-full bg-brand-soft text-[10px] font-bold text-brand">{i + 1}</span>
                <span className="flex flex-col">
                  <span className="text-[11px] font-semibold text-ink">{t}</span>
                  <span className="text-[10px] text-muted-foreground">{d}</span>
                </span>
              </div>
            ))}
          </section>
        </aside>
      </div>
    </>
  );
}
