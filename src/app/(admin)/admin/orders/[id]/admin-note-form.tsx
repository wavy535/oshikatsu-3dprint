"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateAdminNote } from "@/features/admin/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function AdminNoteForm({ orderId, note }: { orderId: string; note: string | null }) {
  const [value, setValue] = useState(note ?? "");
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      const result = await updateAdminNote(orderId, value);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("メモを保存しました");
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea rows={3} value={value} onChange={(e) => setValue(e.target.value)} />
      <Button size="sm" variant="outline" disabled={isPending} onClick={handleSave} className="self-start">
        メモを保存
      </Button>
    </div>
  );
}
