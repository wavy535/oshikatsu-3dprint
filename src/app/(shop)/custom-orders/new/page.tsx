import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getOptionalUser } from "@/lib/auth/guards";
import { getProductBySlug } from "@/features/products/queries";
import { listNuiSizes } from "@/features/nuis/queries";
import { CustomOrderForm } from "./custom-order-form";

export const metadata = { title: "オーダーメイド相談" };

export default async function NewCustomOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  const { product: slug } = await searchParams;
  if (!slug) notFound();

  const { user } = await getOptionalUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/custom-orders/new?product=${slug}`)}`);
  }

  const [product, nuiSizes] = await Promise.all([
    getProductBySlug(slug),
    listNuiSizes(),
  ]);
  if (!product) notFound();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-6">
      <div className="flex flex-col gap-1">
        <Link
          href={`/products/${product.slug}`}
          className="text-xs text-muted-foreground hover:text-ink"
        >
          ← {product.title}
        </Link>
        <h1 className="text-lg font-bold text-ink">オーダーメイド相談</h1>
        <p className="text-[11.5px] text-muted-foreground">
          {product.profiles?.display_name} さんへの相談です。
          サイズ・カラー・加工の希望を書いて送ってください。
        </p>
      </div>

      <CustomOrderForm
        productId={product.id}
        nuiSizes={nuiSizes.map((s) => ({ id: s.id, label: s.label }))}
      />
    </div>
  );
}
