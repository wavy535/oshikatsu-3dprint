import Link from "next/link";
import { Bell, MessageSquare, Package, Star, Tag, Wrench } from "lucide-react";

import { listNotifications, KIND_LABEL } from "@/lib/notifications/queries";
import { markAllReadAction } from "@/lib/notifications/actions";
import type { NotificationKind } from "@/types/db";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata = { title: "通知" };

const ICON: Record<NotificationKind, React.ComponentType<{ className?: string }>> = {
  order_shipping: Package,
  favorite_price: Tag,
  message: MessageSquare,
  review: Star,
  creator: Wrench,
  announcement: Bell,
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "たった今";
  if (min < 60) return `${min}分前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}時間前`;
  return `${Math.floor(hour / 24)}日前`;
}

/** Figma ④マイページ「通知一覧」。通知はDBのトリガーが作るので、ここは読むだけ。 */
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const { kind } = await searchParams;
  const active = (kind && kind in KIND_LABEL ? kind : undefined) as NotificationKind | undefined;
  const items = await listNotifications(active);
  const unread = items.filter((n) => !n.read_at).length;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-base font-bold text-ink">通知</h1>
        {unread > 0 && (
          <span className="num rounded-full bg-danger px-2 py-0.5 text-[11px] font-semibold text-white">
            未読 {unread}
          </span>
        )}
        <form action={markAllReadAction} className="ml-auto">
          <Button type="submit" variant="ghost" size="sm" disabled={unread === 0}>
            すべて既読にする
          </Button>
        </form>
      </div>

      <nav className="flex flex-wrap gap-1">
        <Link
          href="/mypage/notifications"
          className={
            active === undefined
              ? "rounded-full bg-brand px-3 py-1 text-[11.5px] font-semibold text-white"
              : "rounded-full bg-white px-3 py-1 text-[11.5px] text-muted-foreground hover:text-ink"
          }
        >
          すべて
        </Link>
        {Object.entries(KIND_LABEL).map(([k, label]) => (
          <Link
            key={k}
            href={`/mypage/notifications?kind=${k}`}
            className={
              active === k
                ? "rounded-full bg-brand px-3 py-1 text-[11.5px] font-semibold text-white"
                : "rounded-full bg-white px-3 py-1 text-[11.5px] text-muted-foreground hover:text-ink"
            }
          >
            {label}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-line bg-white px-6 py-16 text-center">
          <Bell className="size-6 text-line" aria-hidden />
          <p className="text-sm font-semibold text-ink">通知はありません</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((n) => {
            const Icon = ICON[n.kind];
            const isUnread = !n.read_at;
            return (
              <Link
                key={n.id}
                href={n.link_path}
                className={cn(
                  "flex items-start gap-3 rounded-xl border p-3.5 transition-colors",
                  isUnread ? "border-brand/30 bg-brand-soft/40" : "border-line bg-white hover:bg-ground/40"
                )}
              >
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-white">
                  <Icon className="size-4 text-brand" aria-hidden />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[12.5px] font-semibold text-ink">{n.title}</span>
                    {isUnread && <span className="size-1.5 shrink-0 rounded-full bg-danger" aria-label="未読" />}
                  </span>
                  {n.body && (
                    <span className="line-clamp-2 text-[11.5px] leading-4 text-muted-foreground">
                      {n.body}
                    </span>
                  )}
                  <span className="text-[10.5px] text-muted-foreground">
                    {KIND_LABEL[n.kind]} ・ {timeAgo(n.created_at)}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
