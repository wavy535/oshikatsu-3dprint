"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { toggleFavorite } from "@/features/products/actions";
import { Button } from "@/components/ui/button";

export function FavoriteButton({
  productId,
  productSlug,
  isLoggedIn,
  initialFavorited,
}: {
  productId: string;
  productSlug: string;
  isLoggedIn: boolean;
  initialFavorited: boolean;
}) {
  const router = useRouter();
  const [favorited, setFavorited] = useState(initialFavorited);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!isLoggedIn) {
      router.push(`/login?next=/products/${productSlug}`);
      return;
    }
    startTransition(async () => {
      const result = await toggleFavorite(productId, productSlug);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setFavorited(result.data.favorited);
    });
  }

  return (
    <Button
      type="button"
      variant={favorited ? "default" : "outline"}
      disabled={isPending}
      onClick={handleClick}
    >
      {favorited ? "♥ お気に入り済み" : "♡ お気に入り"}
    </Button>
  );
}
