import { getOptionalUser } from "@/lib/auth/guards";
import { listMyNuis, listNuiSizes } from "@/features/nuis/queries";
import { listCategories, listTags, searchProducts } from "@/features/products/queries";
import { parseProductFilters } from "@/features/products/search-params";
import { CategoryBar } from "@/components/layout/site-header";
import { ProductBrowser } from "@/components/product/product-browser";

export const metadata = { title: "検索結果" };

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const { user } = await getOptionalUser();

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

  // 適用中の条件をチップで並べる（Figma 2038:873）
  const chips: string[] = [];
  if (filters.q) chips.push(`キーワード: ${filters.q}`);
  const category = categories.find((c) => c.id === filters.categoryId);
  if (category) chips.push(category.name);
  for (const id of filters.nuiSizeIds ?? []) {
    const size = nuiSizes.find((s) => s.id === id);
    if (size) chips.push(size.label);
  }
  for (const id of filters.tagIds ?? []) {
    const tag = tags.find((t) => t.id === id);
    if (tag) chips.push(tag.name);
  }
  if (filters.priceMin != null) chips.push(`¥${filters.priceMin.toLocaleString()}〜`);
  if (filters.priceMax != null) chips.push(`〜¥${filters.priceMax.toLocaleString()}`);

  return (
    <>
      <CategoryBar
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        activeId={filters.categoryId}
      />
      <ProductBrowser
        heading={filters.q ? `「${filters.q}」の検索結果` : "検索結果"}
        categories={categories.map((c) => ({ id: c.id, label: c.name }))}
        nuiSizes={nuiSizes.map((s) => ({ id: s.id, label: s.label }))}
        tags={tags.map((t) => ({ id: t.id, label: t.name }))}
        defaultNuiSizeIds={defaultNuiSizeIds}
        products={result.items}
        totalCount={result.totalCount}
        appliedChips={
          chips.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">適用中:</span>
              {chips.map((chip) => (
                <span
                  key={chip}
                  className="rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-medium text-accent-foreground"
                >
                  {chip}
                </span>
              ))}
            </div>
          ) : null
        }
      />
    </>
  );
}
