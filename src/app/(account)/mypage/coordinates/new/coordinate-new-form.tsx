"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { createCoordinate } from "@/features/coordinates/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Nui = { id: string; name: string };
type NuiSize = { id: number; label: string };

export function CoordinateNewForm({ nuis, nuiSizes }: { nuis: Nui[]; nuiSizes: NuiSize[] }) {
  const router = useRouter();
  const [preview, setPreview] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const [userNuiId, setUserNuiId] = useState<string>("");
  const [nuiSizeId, setNuiSizeId] = useState<string>("");
  const [isPublic, setIsPublic] = useState(true);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setPreview(URL.createObjectURL(file));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("isPublic", String(isPublic));
    if (userNuiId) formData.set("userNuiId", userNuiId);
    if (nuiSizeId) formData.set("nuiSizeId", nuiSizeId);

    startTransition(async () => {
      const result = await createCoordinate(formData);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("投稿しました");
      router.push(`/mypage/coordinates/${result.data.id}/edit`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <input
          ref={fileRef}
          type="file"
          name="coverImage"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileChange}
          className="hidden"
        />
        <div
          className="flex aspect-square w-48 cursor-pointer items-center justify-center overflow-hidden rounded-xl border bg-muted"
          onClick={() => fileRef.current?.click()}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="size-full object-cover" />
          ) : (
            <span className="text-sm text-muted-foreground">カバー画像を選択</span>
          )}
        </div>
      </div>

      <Input name="title" placeholder="タイトル" maxLength={60} required />
      <Textarea name="body" placeholder="本文（任意）" rows={4} maxLength={2000} />

      {nuis.length > 0 && (
        <Select value={userNuiId} onValueChange={(v) => setUserNuiId(v ?? "")}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="登場するマイぬい（任意）" />
          </SelectTrigger>
          <SelectContent>
            {nuis.map((n) => (
              <SelectItem key={n.id} value={n.id}>
                {n.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Select value={nuiSizeId} onValueChange={(v) => setNuiSizeId(v ?? "")}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="サイズ（任意）" />
        </SelectTrigger>
        <SelectContent>
          {nuiSizes.map((s) => (
            <SelectItem key={s.id} value={String(s.id)}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
        公開する
      </label>

      <Button type="submit" disabled={isPending}>
        {isPending ? "投稿中..." : "投稿する"}
      </Button>
    </form>
  );
}
