import { listCategories, listFilaments, listTags } from "@/features/products/queries";
import { listNuiSizes } from "@/features/nuis/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProductForm } from "../product-form";

export default async function NewProductPage() {
  const [categories, tags, nuiSizes, filaments] = await Promise.all([
    listCategories(),
    listTags(),
    listNuiSizes(),
    listFilaments(),
  ]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>作品を投稿</CardTitle>
      </CardHeader>
      <CardContent>
        <ProductForm master={{ categories, tags, nuiSizes, filaments }} />
      </CardContent>
    </Card>
  );
}
