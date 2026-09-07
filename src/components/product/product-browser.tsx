import { ProductFilterSidebar } from "@/components/product/product-filter-sidebar";
import { ProductGrid } from "@/components/product/product-grid";
import { ProductSortSelect } from "@/components/product/product-sort-select";
import type { ProductCardData } from "@/components/product/product-card";

type MasterOption = { id: number; label: string };

/**
 * Figma ①購入フロー「検索結果」の 2 カラム（左:絞り込み / 右:一覧）。
 * Top Page も同じ構成なので共有している。
 */
export function ProductBrowser({
  heading,
  categories,
  nuiSizes,
  tags,
  defaultNuiSizeIds,
  products,
  totalCount,
  appliedChips,
}: {
  heading: string;
  categories: MasterOption[];
  nuiSizes: MasterOption[];
  tags: MasterOption[];
  defaultNuiSizeIds?: number[];
  products: ProductCardData[];
  totalCount: number;
  appliedChips?: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[1270px] flex-col gap-5 px-6 py-5 lg:flex-row lg:gap-6">
      <ProductFilterSidebar
        categories={categories}
        nuiSizes={nuiSizes}
        tags={tags}
        defaultNuiSizeIds={defaultNuiSizeIds}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-base font-bold text-ink">{heading}</h1>
          <p className="num text-xs text-muted-foreground">{totalCount}件</p>
          <span className="flex-1" />
          <ProductSortSelect />
        </div>

        {appliedChips}

        <ProductGrid products={products} />
      </div>
    </div>
  );
}
