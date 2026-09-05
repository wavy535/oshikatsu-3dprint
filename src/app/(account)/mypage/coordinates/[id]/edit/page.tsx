import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { getCoordinate } from "@/features/coordinates/queries";
import { searchProducts } from "@/features/products/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CoordinateDetailsForm } from "./coordinate-details-form";
import { CoordinateImageManager } from "./coordinate-image-manager";
import { CoordinateItemsManager } from "./coordinate-items-manager";

export default async function EditCoordinatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user } = await requireUser();
  const coordinate = await getCoordinate(id);
  if (!coordinate || coordinate.user_id !== user.id) {
    notFound();
  }

  const { items: products } = await searchProducts({ sort: "newest", perPage: 100 });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">コーデを編集</h1>

      <Card>
        <CardHeader>
          <CardTitle>基本情報</CardTitle>
        </CardHeader>
        <CardContent>
          <CoordinateDetailsForm
            coordinateId={coordinate.id}
            initialTitle={coordinate.title}
            initialBody={coordinate.body ?? ""}
            initialIsPublic={coordinate.is_public}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>写真</CardTitle>
        </CardHeader>
        <CardContent>
          <CoordinateImageManager coordinateId={coordinate.id} images={coordinate.coordinate_images} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>使用作品</CardTitle>
        </CardHeader>
        <CardContent>
          <CoordinateItemsManager
            coordinateId={coordinate.id}
            products={products.map((p) => ({ id: p.id, title: p.title, base_price: p.base_price }))}
            initialSelected={coordinate.coordinate_items.map((i) => i.product_id)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
