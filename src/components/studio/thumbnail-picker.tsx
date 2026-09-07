"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Star, Trash2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import {
  deleteImageAction,
  publishWorkAction,
  registerImageAction,
  setThumbnailAction,
  type StepActionState,
} from "@/lib/works/step-actions";
import { workImageUrl } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const initialState: StepActionState = { error: null };

type Image = { id: string; storagePath: string; sortOrder: number };

/**
 * Figma ②出品フロー「STEP4 公開」。
 * 画像はブラウザから Storage へ直接上げてから、行の登録を Server Action に任せる。
 * 先頭（sort_order = 0）の画像がサムネイルになる。
 */
export function ThumbnailPicker({
  workId,
  userId,
  images,
  isPublished,
}: {
  workId: string;
  userId: string;
  images: Image[];
  isPublished: boolean;
}) {
  const [registerState, registerImage] = useActionState(registerImageAction, initialState);
  const [thumbState, setThumbnail, settingThumb] = useActionState(setThumbnailAction, initialState);
  const [deleteState, removeImage] = useActionState(deleteImageAction, initialState);
  const [publishState, publish, publishing] = useActionState(publishWorkAction, initialState);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function onPick(file: File) {
    setUploadError(null);
    if (!file.type.startsWith("image/")) {
      setUploadError("画像ファイルを選んでください");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError("画像が大きすぎます（10MBまで）");
      return;
    }

    setUploading(true);
    const supabase = createClient();
    const path = `${userId}/${workId}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("work-images").upload(path, file, {
      upsert: true,
      contentType: file.type,
    });
    setUploading(false);

    if (error) {
      setUploadError(`アップロードに失敗しました（${error.message}）`);
      return;
    }

    const fd = new FormData();
    fd.set("workId", workId);
    fd.set("storagePath", path);
    startTransition(() => {
      registerImage(fd);
      setTimeout(() => router.refresh(), 600);
    });
  }

  const error = uploadError ?? registerState.error ?? thumbState.error ?? deleteState.error;

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
        <h2 className="text-[13px] font-semibold text-ink">作品画像</h2>
        <p className="text-[11.5px] text-muted-foreground">
          1枚目がサムネイルになります。星を押すと入れ替えられます。
        </p>

        <div className="flex flex-wrap gap-3">
          {images.map((img, i) => (
            <div
              key={img.id}
              className={cn(
                "flex w-32 flex-col gap-1 rounded-xl border p-2",
                i === 0 ? "border-brand bg-brand-soft/40" : "border-line bg-white"
              )}
            >
              <span className="aspect-square overflow-hidden rounded-lg bg-ground">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={workImageUrl(img.storagePath) ?? ""}
                  alt=""
                  className="size-full object-cover"
                />
              </span>
              <div className="flex items-center gap-1">
                {i === 0 ? (
                  <span className="flex items-center gap-1 text-[10.5px] font-semibold text-star">
                    <Star className="size-3 fill-star" aria-hidden />
                    サムネイル
                  </span>
                ) : (
                  <form action={setThumbnail}>
                    <input type="hidden" name="workId" value={workId} />
                    <input type="hidden" name="imageId" value={img.id} />
                    <button
                      type="submit"
                      disabled={settingThumb}
                      className="flex items-center gap-1 text-[10.5px] text-muted-foreground hover:text-ink"
                    >
                      <Star className="size-3" aria-hidden />
                      選択する
                    </button>
                  </form>
                )}
                <form action={removeImage} className="ml-auto">
                  <input type="hidden" name="workId" value={workId} />
                  <input type="hidden" name="imageId" value={img.id} />
                  <button
                    type="submit"
                    aria-label="この画像を削除"
                    className="text-muted-foreground hover:text-danger"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                </form>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex aspect-square w-32 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line bg-white text-muted-foreground hover:border-brand/40 hover:text-ink"
          >
            <ImagePlus className="size-5" aria-hidden />
            <span className="text-[11px]">{uploading ? "アップロード中..." : "画像を追加"}</span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onPick(file);
            }}
          />
        </div>


        {error && <p className="text-[12px] text-danger">{error}</p>}
      </section>

      <form action={publish} className="flex flex-col gap-2">
        <input type="hidden" name="workId" value={workId} />
        {publishState.error && <p className="text-[12px] text-danger">{publishState.error}</p>}
        <Button type="submit" disabled={publishing} className="self-end">
          {publishing ? "公開しています..." : isPublished ? "内容を更新して公開" : "公開する"}
        </Button>
      </form>
    </div>
  );
}
