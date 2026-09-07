import Link from "next/link";
import { Plus, Smile } from "lucide-react";

import { listMyNuis } from "@/lib/nuis/queries";
import { NuiRow } from "@/components/nui/nui-row";
import { Button } from "@/components/ui/button";

export const metadata = { title: "マイぬい" };

/** Figma ④マイページ「マイぬい」。採寸値が作品との相性判定の基準になる。 */
export default async function NuisPage() {
  const nuis = await listMyNuis();

  return (
    <>
      <div className="flex items-center gap-3">
        <h1 className="text-base font-bold text-ink">マイぬい</h1>
        <span className="num text-[12px] text-muted-foreground">{nuis.length}体</span>
        <Button asChild size="sm" className="ml-auto">
          <Link href="/mypage/nuis/new">
            <Plus className="size-4" aria-hidden />
            ぬいを登録
          </Link>
        </Button>
      </div>

      <p className="rounded-lg bg-brand-soft px-3 py-2 text-[12px] leading-5 text-accent-foreground">
        メインのぬいのサイズは、作品一覧の絞り込みの既定になります。作品詳細では採寸値と作品の内寸を比べて相性を出します。
      </p>

      {nuis.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-line bg-white px-6 py-16 text-center">
          <Smile className="size-6 text-line" aria-hidden />
          <p className="text-sm font-semibold text-ink">まだ登録されていません</p>
          <p className="text-[12px] text-muted-foreground">
            うちの子を登録すると、入るかどうかを数値で判定できます。
          </p>
          <Button asChild size="sm" className="mt-2">
            <Link href="/mypage/nuis/new">ぬいを登録</Link>
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {nuis.map((nui) => (
            <NuiRow key={nui.id} nui={nui} />
          ))}
        </div>
      )}
    </>
  );
}
