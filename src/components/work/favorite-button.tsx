"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Heart } from "lucide-react";

import { toggleFavoriteAction, type FavoriteState } from "@/lib/works/favorites";
import { cn } from "@/lib/utils";

export function FavoriteButton({
  workId,
  favorited,
  count,
  signedIn,
}: {
  workId: string;
  favorited: boolean;
  count: number;
  signedIn: boolean;
}) {
  const [state, formAction, pending] = useActionState<FavoriteState, FormData>(
    toggleFavoriteAction,
    { error: null, favorited }
  );

  if (!signedIn) {
    return (
      <Link
        href={`/login?redirect=/works/${workId}`}
        className="flex items-center gap-1 rounded-full border border-line px-2.5 py-1.5 text-[12px] text-muted-foreground hover:text-ink"
        title="ログインするとお気に入りに入れられます"
      >
        <Heart className="size-4" aria-hidden />
        <span className="num">{count}</span>
      </Link>
    );
  }

  const on = state.favorited;
  return (
    <form action={formAction}>
      <input type="hidden" name="workId" value={workId} />
      <button
        type="submit"
        disabled={pending}
        aria-pressed={on}
        className={cn(
          "flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-[12px] transition-colors",
          on ? "border-danger/40 bg-danger-bg text-danger" : "border-line text-muted-foreground hover:text-ink"
        )}
      >
        <Heart className={cn("size-4", on && "fill-danger")} aria-hidden />
        <span className="num">{on ? count + (favorited ? 0 : 1) : count - (favorited ? 1 : 0)}</span>
      </button>
      {state.error && <p className="mt-1 text-[11px] text-danger">{state.error}</p>}
    </form>
  );
}
