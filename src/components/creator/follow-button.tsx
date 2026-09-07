"use client";

import { useActionState } from "react";
import Link from "next/link";
import { UserCheck, UserPlus } from "lucide-react";

import { toggleFollowAction, type FollowActionState } from "@/lib/creators/actions";
import { Button } from "@/components/ui/button";

const initial: FollowActionState = { error: null };

/** フォローボタン。未ログインならログインへ。 */
export function FollowButton({
  creatorId,
  isFollowing,
  loggedIn,
}: {
  creatorId: string;
  isFollowing: boolean;
  loggedIn: boolean;
}) {
  const [state, action, pending] = useActionState(toggleFollowAction, initial);
  const following = state.following ?? isFollowing;

  if (!loggedIn) {
    return (
      <Button asChild size="lg" className="w-full">
        <Link href={`/login?redirect=${encodeURIComponent(`/creators/${creatorId}`)}`}>
          <UserPlus className="size-4" aria-hidden />
          フォローする
        </Link>
      </Button>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="creatorId" value={creatorId} />
      <Button type="submit" size="lg" variant={following ? "outline" : "default"} disabled={pending} className="w-full">
        {following ? <UserCheck className="size-4" aria-hidden /> : <UserPlus className="size-4" aria-hidden />}
        {following ? "フォロー中" : "フォローする"}
      </Button>
      {state.error && <p className="text-[11px] text-danger">{state.error}</p>}
    </form>
  );
}
