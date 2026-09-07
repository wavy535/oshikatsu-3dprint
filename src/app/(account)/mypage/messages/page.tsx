import Link from "next/link";
import { MessageCircle } from "lucide-react";

import { getThread, listThreads, resolveCounterpart } from "@/lib/messages/queries";
import { ORDER_STATUS_LABEL } from "@/lib/orders/queries";
import { shortDateTime } from "@/lib/ops/labels";
import { yen } from "@/components/work/work-card";
import { Avatar } from "@/components/ui/avatar";
import { MessageComposer } from "@/components/messages/message-composer";
import { cn } from "@/lib/utils";

export const metadata = { title: "メッセージ" };

function dayLabel(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/**
 * Figma ③やりとり「メッセージ」。左に相手ごとのスレッド、右にやりとり。
 * `?with=<ユーザーID>` で相手を開く（`with=admin` は運営）。
 */
export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ with?: string; filter?: string; order?: string }>;
}) {
  const sp = await searchParams;
  const withId = await resolveCounterpart(sp.with);
  const [threads, thread] = await Promise.all([listThreads(), withId ? getThread(withId) : null]);

  const unreadOnly = sp.filter === "unread";
  const visible = unreadOnly ? threads.filter((t) => t.unread > 0) : threads;
  const totalUnread = threads.reduce((n, t) => n + t.unread, 0);

  return (
    <>
      <div className="flex items-center gap-2">
        <h1 className="text-base font-bold text-ink">メッセージ</h1>
        {totalUnread > 0 && (
          <span className="num rounded-full bg-danger px-1.5 text-[10px] font-bold text-white">{totalUnread}</span>
        )}
      </div>

      <div className="flex min-h-[520px] flex-col gap-4 lg:flex-row">
        <aside className="flex w-full flex-col overflow-hidden rounded-xl border border-line bg-white lg:w-80 lg:flex-none">
          <div className="flex gap-1.5 border-b border-line px-3 py-2.5">
            {[
              { key: "all", label: "すべて", href: withId ? `/mypage/messages?with=${sp.with}` : "/mypage/messages" },
              { key: "unread", label: "未読", href: `/mypage/messages?filter=unread${sp.with ? `&with=${sp.with}` : ""}` },
            ].map((c) => (
              <Link
                key={c.key}
                href={c.href}
                className={cn(
                  "rounded-full px-3 py-1 text-[11px] font-semibold",
                  (c.key === "unread") === unreadOnly ? "bg-brand text-white" : "bg-ground text-muted-foreground hover:text-ink"
                )}
              >
                {c.label}
              </Link>
            ))}
          </div>
          {visible.length === 0 ? (
            <p className="px-4 py-10 text-center text-[12px] text-muted-foreground">
              {unreadOnly ? "未読のメッセージはありません。" : "まだメッセージはありません。"}
            </p>
          ) : (
            visible.map((t) => (
              <Link
                key={t.counterpartId}
                href={`/mypage/messages?with=${t.counterpartId}${unreadOnly ? "&filter=unread" : ""}`}
                className={cn(
                  "flex items-center gap-2.5 border-b border-line px-3.5 py-2.5 transition-colors hover:bg-ground",
                  t.counterpartId === withId && "bg-brand-soft"
                )}
              >
                <Avatar src={t.avatarUrl} name={t.name} className="size-9" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-baseline gap-2">
                    <span className="truncate text-[12px] font-semibold text-ink">{t.name || "ユーザー"}</span>
                    {t.role === "admin" && <span className="rounded bg-console px-1 text-[9px] font-semibold text-white">運営</span>}
                    <span className="num ml-auto text-[10px] text-muted-foreground">{shortDateTime(t.lastAt)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[10.5px] text-muted-foreground">{t.lastBody}</span>
                    {t.unread > 0 && (
                      <span className="num ml-auto rounded-full bg-danger px-1.5 text-[9px] font-bold text-white">{t.unread}</span>
                    )}
                  </span>
                </span>
              </Link>
            ))
          )}
        </aside>

        <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-white">
          {!thread ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-16 text-center">
              <MessageCircle className="size-6 text-line" aria-hidden />
              <p className="text-sm font-semibold text-ink">スレッドを選んでください</p>
              <p className="text-[12px] text-muted-foreground">
                作品ページの「メッセージを送る」や、注文の「運営に問い合わせ」から新しいやりとりを始められます。
              </p>
              <Link href="/mypage/messages?with=admin" className="text-[12px] font-semibold text-brand hover:underline">
                運営に問い合わせる
              </Link>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 border-b border-line px-4 py-3">
                <Avatar src={thread.counterpart.avatar_url} name={thread.counterpart.display_name} className="size-9" />
                <span className="flex flex-col">
                  <span className="text-[13px] font-semibold text-ink">{thread.counterpart.display_name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {thread.counterpart.role === "admin" ? "OshiNest 運営" : thread.counterpart.role === "creator" ? "クリエイター" : "購入者"}
                  </span>
                </span>
                {thread.counterpart.role === "creator" && (
                  <Link href={`/creators/${thread.counterpart.id}`} className="ml-auto text-[11px] text-brand hover:underline">
                    プロフィール
                  </Link>
                )}
              </div>

              <div className="flex flex-1 flex-col gap-3 bg-ground px-4 py-4">
                {thread.messages.length === 0 && (
                  <p className="py-8 text-center text-[12px] text-muted-foreground">
                    まだやりとりはありません。最初のメッセージを送ってみましょう。
                  </p>
                )}
                {thread.messages.map((m, i) => {
                  const mine = m.sender_id === thread.me;
                  const prev = thread.messages[i - 1];
                  const newDay = !prev || dayLabel(prev.created_at) !== dayLabel(m.created_at);
                  const order = m.order_id ? thread.orders.get(m.order_id) : null;
                  return (
                    <div key={m.id} className="flex flex-col gap-2">
                      {newDay && (
                        <div className="flex items-center gap-2">
                          <span className="h-px flex-1 bg-line" />
                          <span className="num text-[10px] text-muted-foreground">{dayLabel(m.created_at)}</span>
                          <span className="h-px flex-1 bg-line" />
                        </div>
                      )}
                      {order && (!prev || prev.order_id !== m.order_id) && (
                        <Link
                          href={`/mypage/orders/${order.id}`}
                          className="flex items-center gap-2 self-center rounded-lg border border-brand bg-white px-3 py-1.5 text-[10.5px] text-ink hover:bg-brand-soft"
                        >
                          この取引について：{order.order_items[0]?.works?.title ?? "注文"}
                          <span className="num text-muted-foreground">
                            #{order.id.slice(0, 8)} ・ {yen(order.total_amount)} ・ {ORDER_STATUS_LABEL[order.status]}
                          </span>
                        </Link>
                      )}
                      <div className={cn("flex items-end gap-2", mine ? "justify-end" : "justify-start")}>
                        {!mine && <Avatar src={thread.counterpart.avatar_url} name={thread.counterpart.display_name} className="size-7" />}
                        <div className={cn("flex max-w-[70%] flex-col gap-0.5", mine ? "items-end" : "items-start")}>
                          <p
                            className={cn(
                              "whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[12px] leading-5",
                              mine ? "bg-brand text-white" : "border border-line bg-white text-ink"
                            )}
                          >
                            {m.body}
                          </p>
                          <span className="num text-[9px] text-muted-foreground">
                            {mine && m.read_at ? "既読 " : ""}
                            {shortDateTime(m.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <MessageComposer recipientId={thread.counterpart.id} orderId={sp.order} />
            </>
          )}
        </section>
      </div>
    </>
  );
}
