"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteCoordinateImage, uploadCoordinateImage } from "@/features/coordinates/actions";
import { Button } from "@/components/ui/button";

type CoordinateImage = { id: string; image_url: string };

export function CoordinateImageManager({
  coordinateId,
  images,
}: {
  coordinateId: string;
  images: CoordinateImage[];
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
    uploadCoordinateImage(coordinateId, formData).then((result) => {
      setUploading(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("画像を追加しました");
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  function handleDelete(id: string) {
    if (!window.confirm("この画像を削除しますか？")) return;
    startTransition(async () => {
      const result = await deleteCoordinateImage(id);
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
            <img src={image.image_url} alt="" className="size-full object-cover" />
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
          {uploading ? "アップロード中..." : "追加の写真を登録"}
        </Button>
      </div>
    </div>
  );
}
