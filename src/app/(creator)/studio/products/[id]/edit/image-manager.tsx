"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteProductImage, uploadProductImage } from "@/features/products/actions";
import { Button } from "@/components/ui/button";

type ProductImage = { id: string; image_url: string };

export function ImageManager({
  productId,
  images,
}: {
  productId: string;
  images: ProductImage[];
}) {
  const [uploading, setUploading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.set("file", file);
    setUploading(true);
    uploadProductImage(productId, formData).then((result) => {
      setUploading(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("画像をアップロードしました");
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  function handleDelete(id: string) {
    if (!window.confirm("この画像を削除しますか？")) return;
    startTransition(async () => {
      const result = await deleteProductImage(id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("削除しました");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-4 gap-3">
        {images.map((image) => (
          <div key={image.id} className="group relative aspect-square overflow-hidden rounded-lg border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.image_url}
              alt=""
              className="size-full object-cover"
            />
            <Button
              size="icon-sm"
              variant="destructive"
              disabled={isPending}
              className="absolute top-1 right-1 opacity-0 group-hover:opacity-100"
              onClick={() => handleDelete(image.id)}
            >
              ×
            </Button>
          </div>
        ))}
      </div>
      {images.length === 0 && (
        <p className="text-sm text-muted-foreground">まだ画像がありません</p>
      )}
      <div>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? "アップロード中..." : "画像を追加"}
        </Button>
      </div>
    </div>
  );
}
