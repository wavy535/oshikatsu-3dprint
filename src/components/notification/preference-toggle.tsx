"use client";

import { useActionState } from "react";
import { Lock } from "lucide-react";

import {
  toggleNotificationPreferenceAction,
  type NotificationActionState,
} from "@/lib/notifications/actions";
import { cn } from "@/lib/utils";

const initialState: NotificationActionState = { error: null };

/**
 * 受け取り方のトグル。取引に関わる種類のアプリ内通知は常時オンで、
 * 押せないことが見て分かるように鍵を出す（DBの check 制約と同じ判断）。
 */
export function PreferenceToggle({
  kind,
  channel,
  on,
  locked,
  label,
}: {
  kind: string;
  channel: "in_app" | "email" | "push";
  on: boolean;
  locked?: boolean;
  label: string;
}) {
  const [state, formAction, pending] = useActionState(
    toggleNotificationPreferenceAction,
    initialState
  );

  if (locked) {
    return (
      <span
        className="flex items-center gap-1 rounded-full bg-ground px-2.5 py-1 text-[11px] text-muted-foreground"
        title="この通知はオフにできません"
      >
        <Lock className="size-3" aria-hidden />
        常時オン
      </span>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="channel" value={channel} />
      <input type="hidden" name="value" value={on ? "off" : "on"} />
      <button
        type="submit"
        disabled={pending}
        aria-pressed={on}
        aria-label={`${label}を${on ? "オフ" : "オン"}にする`}
        className={cn(
          "flex h-6 w-11 items-center rounded-full p-0.5 transition-colors",
          on ? "bg-brand" : "bg-line"
        )}
      >
        <span
          className={cn(
            "size-5 rounded-full bg-white transition-transform",
            on && "translate-x-5"
          )}
        />
      </button>
      {state.error && <p className="mt-1 text-[10px] text-danger">{state.error}</p>}
    </form>
  );
}
