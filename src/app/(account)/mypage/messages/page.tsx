import { Pagination } from "@/components/ui/pagination";
import { MessageReadReceipt } from "@/components/messages/message-read-receipt";
import Link from "next/link";
import { ArrowLeft, MessageCircle } from "lucide-react";

import { getThread, listThreads, resolveCounterpart } from "@/lib/messages/queries";
import { ORDER_STATUS_LABEL } from "@/lib/orders/queries";
import { shortDateTime } from "@/lib/ops/labels";
import { yen } from "@/lib/format";
import { Avatar } from "@/components/ui/avatar";
import { MessageComposer } from "@/components/messages/message-composer";
import { MessageHistory } from "@/components/messages/message-history";
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
  searchParams: Promise<{ with?: string; filter?: string; order?: string; page?: string; before?: string }>;
}) {
  const sp = await searchParams;
  const withId = await resolveCounterpart(sp.with);
  const unreadOnly = sp.filter === "unread";
  const [{ items: visible, page, hasNext, totalUnread }, thread] = await Promise.all([
    listThreads(sp.page, unreadOnly), withId ? getThread(withId, sp.before) : null,
  ]);
  const latestParams = new URLSearchParams(
    Object.entries(sp).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
  latestParams.delete("before");
  if (withId) latestParams.set("with", withId);
  const latestHref = `/mypage/messages?${latestParams}`;
  const listParams = new URLSearchParams(latestParams);
  listParams.delete("with");
  listParams.delete("order");
  const listHref = `/mypage/messages${listParams.size ? `?${listParams}` : ""}`;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="page-title font-bold text-ink">メッセージ</h1>
        {totalUnread > 0 && (
          <span className="num rounded-full bg-danger px-1.5 text-sm font-bold text-white">{totalUnread}</span>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-4 lg:min-h-[520px] lg:flex-row">
        <aside
          aria-label="相手とのやりとり一覧"
          className={cn(
            "flex w-full min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-white lg:w-80 lg:flex-none",
            thread && "hidden lg:flex",
          )}
        >
          <div className="flex gap-1.5 border-b border-line px-3 py-2.5">
            {[
              { key: "all", label: "すべて", href: withId ? `/mypage/messages?with=${sp.with}` : "/mypage/messages" },
              { key: "unread", label: "未読", href: `/mypage/messages?filter=unread${sp.with ? `&with=${sp.with}` : ""}` },
            ].map((c) => (
              <Link
                prefetch={false}
                key={c.key}
                href={c.href}
                className={cn(
                  "rounded-full px-3 py-1 text-sm font-semibold",
                  (c.key === "unread") === unreadOnly ? "bg-brand text-white" : "bg-ground text-muted-foreground hover:text-ink"
                )}
              >
                {c.label}
              </Link>
            ))}
          </div>
          {visible.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              {unreadOnly ? "未読のメッセージはありません。" : "まだメッセージはありません。"}
            </p>
          ) : (
            visible.map((t) => (
              <Link
                prefetch={false}
                key={t.counterpartId}
                href={`/mypage/messages?with=${t.counterpartId}${unreadOnly ? "&filter=unread" : ""}`}
                aria-current={t.counterpartId === withId ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 border-b border-line px-3.5 py-2.5 transition-colors hover:bg-ground",
                  t.counterpartId === withId && "bg-brand-soft"
                )}
              >
                <Avatar src={t.avatarUrl} name={t.name} className="size-9" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="min-w-0 truncate text-sm font-semibold text-ink">{t.name || "ユーザー"}</span>
                    {t.role === "admin" && <span className="shrink-0 rounded bg-console px-1 text-sm font-semibold text-white">運営</span>}
                    <span className="num ml-auto shrink-0 whitespace-nowrap text-sm text-muted-foreground">{shortDateTime(t.lastAt)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm text-muted-foreground">{t.lastBody}</span>
                    {t.unread > 0 && (
                      <span className="num ml-auto rounded-full bg-danger px-1.5 text-sm font-bold text-white">{t.unread}</span>
                    )}
                  </span>
                </span>
              </Link>
            ))
          )}
          <Pagination path="/mypage/messages" params={sp} page={page} hasNext={hasNext} label="スレッド一覧のページ切り替え" />
        </aside>

        <section
          aria-label="相手との会話"
          className={cn(
            "flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-white",
            thread && "h-[max(12rem,calc(100dvh-20rem-env(safe-area-inset-bottom)))] flex-none lg:h-[640px] lg:flex-1",
            !thread && visible.length > 0 && "hidden lg:flex",
          )}
        >
          {!thread ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-16 text-center">
              <MessageCircle className="size-6 text-line" aria-hidden />
              <p className="text-sm font-semibold text-ink">スレッドを選んでください</p>
              <p className="text-sm text-muted-foreground">
                作品ページの「メッセージを送る」や、注文の「運営に問い合わせ」から新しいやりとりを始められます。
              </p>
              <Link prefetch={false} href="/mypage/messages?with=admin" className="text-sm font-semibold text-brand hover:underline">
                運営に問い合わせる
              </Link>
            </div>
          ) : (
            <>
              <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2 sm:gap-3 sm:px-4 sm:py-3">
                <Link
                  prefetch={false}
                  href={listHref}
                  aria-label="やりとり一覧に戻る"
                  className="flex size-11 shrink-0 items-center justify-center rounded-lg text-brand hover:bg-ground lg:hidden"
                >
                  <ArrowLeft className="size-5" aria-hidden />
                </Link>
                <Avatar src={thread.counterpart.avatar_url} name={thread.counterpart.display_name} className="size-9" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-semibold text-ink">{thread.counterpart.display_name}</span>
                  <span className="text-sm text-muted-foreground">
                    {thread.counterpart.role === "admin" ? "OshiNest 運営" : thread.counterpart.role === "creator" ? "クリエイター" : "購入者"}
                  </span>
                </span>
                {thread.counterpart.role === "creator" && (
                  <Link prefetch={false} href={`/creators/${thread.counterpart.id}`} className="ml-auto shrink-0 text-sm text-brand hover:underline">
                    プロフィール
                  </Link>
                )}
              </div>

              <MessageHistory
                key={thread.counterpart.id}
                latestMessageId={thread.messages.at(-1)?.id}
                showLatest={!sp.before}
              >
                {thread.messages.length === 0 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    まだやりとりはありません。最初のメッセージを送ってみましょう。
                  </p>
                )}
                {thread.messages.map((m, i) => {
                  const mine = m.sender_id === thread.me;
                  const prev = thread.messages[i - 1];
                  const newDay = !prev || dayLabel(prev.created_at) !== dayLabel(m.created_at);
                  const order = m.order_id ? thread.orders.get(m.order_id) : null;
                  return (
                    <div key={m.id} className="flex shrink-0 flex-col gap-2">
                      {newDay && (
                        <div className="flex items-center gap-2">
                          <span className="h-px flex-1 bg-line" />
                          <span className="num text-sm text-muted-foreground">{dayLabel(m.created_at)}</span>
                          <span className="h-px flex-1 bg-line" />
                        </div>
                      )}
                      {order && (!prev || prev.order_id !== m.order_id) && (
                        <Link
                          prefetch={false}
                          href={`/mypage/orders/${order.id}`}
                          className="flex max-w-full flex-wrap items-center gap-2 self-center rounded-lg border border-brand bg-white px-3 py-1.5 text-sm text-ink hover:bg-brand-soft"
                        >
                          この取引について：{order.order_items[0]?.works?.title ?? "注文"}
                          <span className="num text-muted-foreground">
                            #{order.id.slice(0, 8)} ・ {yen(order.total_amount)} ・ {ORDER_STATUS_LABEL[order.status]}
                          </span>
                        </Link>
                      )}
                      <div className={cn("flex items-end gap-2", mine ? "justify-end" : "justify-start")}>
                        {!mine && <Avatar src={thread.counterpart.avatar_url} name={thread.counterpart.display_name} className="size-7" />}
                        <div className={cn("flex min-w-0 max-w-[85%] flex-col gap-0.5 sm:max-w-[70%]", mine ? "items-end" : "items-start")}>
                          <p
                            className={cn(
                              "max-w-full whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-6 [overflow-wrap:anywhere]",
                              mine ? "bg-brand text-white" : "border border-line bg-white text-ink"
                            )}
                          >
                            {m.body}
                          </p>
                          <span className="num text-sm text-muted-foreground">
                            {mine && m.read_at ? "既読 " : ""}
                            {shortDateTime(m.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </MessageHistory>

              <MessageReadReceipt ids={thread.messages.filter((m) => m.recipient_id === thread.me && !m.read_at).map((m) => m.id)} />
              <div className="flex shrink-0 justify-center gap-3 py-2 text-sm text-brand">
                {thread.olderCursor && <Link prefetch={false} href={`${latestHref}&before=${thread.olderCursor}`}>過去のメッセージ</Link>}
                {sp.before && <Link prefetch={false} href={latestHref}>最新のメッセージ</Link>}
              </div>
              <MessageComposer key={thread.counterpart.id} recipientId={thread.counterpart.id} orderId={sp.order} latestHref={sp.before ? latestHref : undefined} />
            </>
          )}
        </section>
      </div>
    </>
  );
}
