"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { updateItemStatus } from "@/features/admin/actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUSES = ["pending", "printing", "printed", "shipped", "cancelled"] as const;
const LABEL: Record<(typeof STATUSES)[number], string> = {
  pending: "未着手",
  printing: "制作中",
  printed: "制作完了",
  shipped: "発送済み",
  cancelled: "取消",
};

export function ItemStatusSelect({
  orderItemId,
  status,
}: {
  orderItemId: string;
  status: string;
}) {
  const [isPending, startTransition] = useTransition();

  function handleChange(value: string | null) {
    if (!value) return;
    startTransition(async () => {
      const result = await updateItemStatus(
        orderItemId,
        value as (typeof STATUSES)[number]
      );
      if (!result.ok) toast.error(result.error);
    });
  }

  return (
    <Select value={status} onValueChange={handleChange} disabled={isPending}>
      <SelectTrigger size="sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            {LABEL[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
