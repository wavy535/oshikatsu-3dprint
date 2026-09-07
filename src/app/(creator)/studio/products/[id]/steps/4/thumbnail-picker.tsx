"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Check, ImagePlus } from "lucide-react";
import { uploadProductImage } from "@/features/products/actions";
import { publishProduct } from "@/features/products/step-actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ProductImage = { id: string; image_url: string };

/**
 * Figma ②出品フロー STEP4（51:949）。
 * サムネイルを選んで公開（= 審査に提出）すると作品管理の一覧に並ぶ。
 */
export function ThumbnailPicker({
  productId,
  images,
  status,
}: {
  productId: string;
  images: ProductImage[];
  status: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<string | null>(images[0]?.id ?? null);
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleUpload(file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.set("file", file);
    const result = await uploadProductImage(productId, fd);
    setUploading(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("画像を追加しました");
    router.refresh();
  }

  async function handlePublish() {
    setPending(true);
    const result = await publishProduct(productId, selected);
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      status === "published" ? "サムネイルを更新しました" : "審査に提出しました"
    );
    router.push("/studio/products");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4">
        <p className="text-sm font-bold text-ink">サムネイルを選ぶ</p>
        {images.length === 0 ? (
          <p className="rounded-lg bg-ground px-3 py-6 text-center text-[12px] text-muted-foreground">
            画像がまだありません。1枚以上追加してください。
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {images.map((image) => {
              const on = selected === image.id;
              return (
                <button
                  key={image.id}
                  type="button"
                  onClick={() => setSelected(image.id)}
                  aria-pressed={on}
                  className={cn(
                    "relative overflow-hidden rounded-lg border-2 transition-colors",
                    on ? "border-brand" : "border-line hover:border-brand/40"
                  )}
                >
                  <span className="flex aspect-square w-full items-center justify-center bg-ground">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image.image_url} alt="" className="size-full object-cover" />
                  </span>
                  <span
                    className={cn(
                      "absolute right-1.5 bottom-1.5 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      on ? "bg-brand text-white" : "bg-white/90 text-muted-foreground"
                    )}
                  >
                    {on ? <Check className="size-2.5" aria-hidden /> : null}
                    {on ? "サムネイル" : "選択する"}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus />
          {uploading ? "アップロード中..." : "画像を追加"}
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          size="lg"
          disabled={pending || images.length === 0}
          onClick={handlePublish}
        >
          {pending
            ? "送信中..."
            : status === "published"
              ? "サムネイルを更新する"
              : "公開する（審査に提出）"}
        </Button>
        <p className="text-[11px] text-muted-foreground">
          {status === "published"
            ? "公開中の作品です。"
            : "運営の審査を通過すると公開されます。"}
        </p>
      </div>
    </div>
  );
}
