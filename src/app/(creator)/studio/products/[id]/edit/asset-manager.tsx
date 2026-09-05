"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteProductAsset, uploadProductAsset } from "@/features/products/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Asset = {
  id: string;
  original_name: string;
  file_ext: string;
  file_size: number;
  part_label: string | null;
};

function formatSize(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export function AssetManager({ productId, assets }: { productId: string; assets: Asset[] }) {
  const [uploading, setUploading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.set("file", file);
    setUploading(true);
    uploadProductAsset(productId, formData).then((result) => {
      setUploading(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("STLをアップロードしました");
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  function handleDelete(id: string) {
    if (!window.confirm("このSTLを削除しますか？")) return;
    startTransition(async () => {
      const result = await deleteProductAsset(id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("削除しました");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        制作データ（STL/3MF/OBJ/STEP）。購入者には一切公開されません。Adminのみ閲覧・ダウンロードできます。
      </p>
      {assets.length === 0 && (
        <p className="text-sm text-muted-foreground">まだアップロードされていません</p>
      )}
      <div className="flex flex-col gap-2">
        {assets.map((asset) => (
          <Card key={asset.id}>
            <CardContent className="flex items-center justify-between py-2">
              <div className="text-sm">
                <span className="font-medium">{asset.original_name}</span>
                <span className="ml-2 text-muted-foreground">
                  {asset.file_ext.toUpperCase()} / {formatSize(asset.file_size)}
                  {asset.part_label ? ` / ${asset.part_label}` : ""}
                </span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                disabled={isPending}
                onClick={() => handleDelete(asset.id)}
              >
                削除
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      <div>
        <input
          ref={inputRef}
          type="file"
          accept=".stl,.3mf,.obj,.step"
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
          {uploading ? "アップロード中..." : "STLを追加"}
        </Button>
      </div>
    </div>
  );
}
