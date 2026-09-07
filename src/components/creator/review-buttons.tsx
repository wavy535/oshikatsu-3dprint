"use client";

import { useTransition } from "react";

import {
  approveCreatorApplicationAction,
  rejectCreatorApplicationAction,
} from "@/lib/creator/actions";
import { Button } from "@/components/ui/button";

export function ReviewButtons({ applicationId }: { applicationId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await approveCreatorApplicationAction(applicationId);
          })
        }
      >
        承認する
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await rejectCreatorApplicationAction(applicationId);
          })
        }
      >
        却下する
      </Button>
    </div>
  );
}
