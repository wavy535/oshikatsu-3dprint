import { getOptionalUser } from "@/lib/auth/guards";
import { listCategories, searchProducts, type ProductFilters } from "@/features/products/queries";
import { listMyNuis, listNuiSizes } from "@/features/nuis/queries";
import { ProductFilterBar } from "@/components/product/product-filter-bar";
import { ProductGrid } from "@/components/product/product-grid";

const SORT_VALUES = ["newest", "popular", "price_asc", "price_desc", "rating"] as const;

function parseIntArray(value: string | undefined): number[] {
  if (!value) return [];
  return value
    .split(",")
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n));
}

function parseSort(value: string | undefined): ProductFilters["sort"] {
  return (SORT_VALUES as readonly string[]).includes(value ?? "")
    ? (value as ProductFilters["sort"])
    : "newest";
}

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

  const nuiSizeIds = sp.nuiSizes !== undefined ? parseIntArray(sp.nuiSizes) : defaultNuiSizeIds;

  const [categories, nuiSizes, result] = await Promise.all([
    listCategories(),
    listNuiSizes(),
    searchProducts({
      q: sp.q,
      categoryId: sp.category ? Number(sp.category) : undefined,
      nuiSizeIds,
      priceMin: sp.priceMin ? Number(sp.priceMin) : undefined,
      priceMax: sp.priceMax ? Number(sp.priceMax) : undefined,
      sort: parseSort(sp.sort),
      page: sp.page ? Number(sp.page) : 1,
    }),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <h1 className="text-xl font-semibold">作品を探す</h1>
      <ProductFilterBar
        categories={categories.map((c) => ({ id: c.id, label: c.name }))}
        nuiSizes={nuiSizes.map((s) => ({ id: s.id, label: s.label }))}
        defaultNuiSizeIds={defaultNuiSizeIds}
      />
      <ProductGrid products={result.items} />
    </div>
  );
}
