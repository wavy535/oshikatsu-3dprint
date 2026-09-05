"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { updateAvatar } from "@/features/auth/actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

export function AvatarForm({
  avatarUrl,
  displayName,
}: {
  avatarUrl: string | null;
  displayName: string;
}) {
  const [preview, setPreview] = useState(avatarUrl);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.set("avatar", file);
    startTransition(async () => {
      const result = await updateAvatar(formData);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setPreview(result.data.url);
      toast.success("アイコンを更新しました");
    });
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar size="lg">
        <AvatarImage src={preview ?? undefined} alt={displayName} />
        <AvatarFallback>{displayName.slice(0, 1)}</AvatarFallback>
      </Avatar>
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
          disabled={pending}
          onClick={() => inputRef.current?.click()}
        >
          {pending ? "アップロード中..." : "アイコンを変更"}
        </Button>
      </div>
    </div>
  );
}
