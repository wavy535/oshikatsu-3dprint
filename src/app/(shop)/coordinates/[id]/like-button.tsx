"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { toggleCoordinateLike } from "@/features/coordinates/actions";
import { Button } from "@/components/ui/button";

export function LikeButton({
  coordinateId,
  isLoggedIn,
  initialLiked,
  initialCount,
}: {
  coordinateId: string;
  isLoggedIn: boolean;
  initialLiked: boolean;
  initialCount: number;
}) {
  const router = useRouter();
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!isLoggedIn) {
      router.push("/login");
      return;
    }
    startTransition(async () => {
      const result = await toggleCoordinateLike(coordinateId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setLiked(result.data.liked);
      setCount((c) => c + (result.data.liked ? 1 : -1));
    });
  }

  return (
    <Button type="button" variant={liked ? "default" : "outline"} disabled={isPending} onClick={handleClick}>
      {liked ? "♥" : "♡"} {count}
    </Button>
  );
}
