import Link from "next/link";
import { MessageSquare, Package, Smile } from "lucide-react";
import { getOptionalUser } from "@/lib/auth/guards";
import { listMyNuis, listNuiSizes } from "@/features/nuis/queries";
import { listCategories, listTags, searchProducts } from "@/features/products/queries";
import { parseProductFilters } from "@/features/products/search-params";
import { CategoryBar } from "@/components/layout/site-header";
import { ProductBrowser } from "@/components/product/product-browser";
import { Button } from "@/components/ui/button";

const HERO_POINTS = [
  { icon: Smile, text: "推しぬいのサイズに合わせて選べる" },
  { icon: Package, text: "印刷・品質管理は運営が代行" },
  { icon: MessageSquare, text: "クリエイターへオーダーメイド相談" },
];

function GuestHero() {
  return (
    <section className="bg-brand">
      <div className="mx-auto flex w-full max-w-[1270px] flex-col gap-5 px-6 py-10">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold text-white sm:text-3xl">
            推し活のための、3Dプリント作品マーケット
          </h1>
          <p className="max-w-2xl text-sm text-white/85">
            クリエイターは3Dデータを出品するだけ。印刷・検品・発送は OshiNest
            運営がすべて代行します。
          </p>
        </div>
        <ul className="flex flex-col gap-2.5 sm:flex-row sm:gap-6">
          {HERO_POINTS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-2.5">
              <span className="flex size-7 items-center justify-center rounded-full bg-white/20">
                <Icon className="size-3.5 text-white" aria-hidden />
              </span>
              <span className="text-xs text-white">{text}</span>
            </li>
          ))}
        </ul>
        <div className="flex gap-2.5">
          <Button
            render={<Link href="/login?mode=signup" />}
            variant="secondary"
            size="lg"
          >
            無料で会員登録
          </Button>
          <Button
            render={<Link href="/products" />}
            size="lg"
            className="bg-white/15 text-white hover:bg-white/25"
          >
            作品をさがす
          </Button>
        </div>
      </div>
    </section>
  );
}

export default async function TopPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const { user } = await getOptionalUser();

  // 未指定なら「うちの子」に合うサイズを既定の絞り込みにする（Figma の
  // 「マイぬい 15cm で自動選択」バッジと同じ考え方）
  let defaultNuiSizeIds: number[] = [];
  if (user && sp.nuiSizes === undefined) {
    const nuis = await listMyNuis(user.id);
    const primary = nuis.find((n) => n.is_primary);
    if (primary) defaultNuiSizeIds = [primary.nui_size_id];
  }

  const filters = parseProductFilters(sp, defaultNuiSizeIds);
  const [categories, nuiSizes, tags, result] = await Promise.all([
    listCategories(),
    listNuiSizes(),
    listTags(),
    searchProducts(filters),
  ]);

  return (
    <>
      {!user && <GuestHero />}
      <CategoryBar
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        activeId={filters.categoryId}
      />
      <ProductBrowser
        heading="作品一覧"
        categories={categories.map((c) => ({ id: c.id, label: c.name }))}
        nuiSizes={nuiSizes.map((s) => ({ id: s.id, label: s.label }))}
        tags={tags.map((t) => ({ id: t.id, label: t.name }))}
        defaultNuiSizeIds={defaultNuiSizeIds}
        products={result.items}
        totalCount={result.totalCount}
      />
    </>
  );
}
