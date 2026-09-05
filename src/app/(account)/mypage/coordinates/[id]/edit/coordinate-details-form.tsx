"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteCoordinate, updateCoordinateDetails } from "@/features/coordinates/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function CoordinateDetailsForm({
  coordinateId,
  initialTitle,
  initialBody,
  initialIsPublic,
}: {
  coordinateId: string;
  initialTitle: string;
  initialBody: string;
  initialIsPublic: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      const result = await updateCoordinateDetails({ id: coordinateId, title, body, isPublic });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("保存しました");
    });
  }

  function handleDelete() {
    if (!window.confirm("この投稿を削除しますか？")) return;
    startTransition(async () => {
      const result = await deleteCoordinate(coordinateId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.push("/mypage/coordinates");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} />
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={2000} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
        公開する
      </label>
      <div className="flex gap-2">
        <Button size="sm" disabled={isPending} onClick={handleSave}>
          保存
        </Button>
        <Button size="sm" variant="ghost" disabled={isPending} onClick={handleDelete}>
          削除
        </Button>
      </div>
    </div>
  );
}
