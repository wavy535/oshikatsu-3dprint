"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { resolveFixRequest } from "@/features/print-jobs/actions";
import { Button } from "@/components/ui/button";

export function ResolveFixRequestButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        const result = await resolveFixRequest(id);
        setPending(false);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("対応済みにしました");
        router.refresh();
      }}
    >
      {pending ? "更新中..." : "対応済みにする"}
    </Button>
  );
}
