import { notFound } from "next/navigation";
import { requireCreator } from "@/lib/auth/guards";
import { getThread } from "@/features/messages/queries";
import { ThreadView } from "@/components/message/thread-view";

export default async function StudioMessageThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user } = await requireCreator();
  const thread = await getThread(id);
  if (!thread || thread.creator_id !== user.id) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">{thread.subject ?? thread.products?.title ?? "メッセージ"}</h1>
        <p className="text-sm text-muted-foreground">
          相手: {thread.buyer?.display_name}
          {thread.orders && ` ・ 注文番号: ${thread.orders.order_number}`}
        </p>
      </div>
      <ThreadView
        threadId={thread.id}
        currentUserId={user.id}
        messages={thread.messages}
        isClosed={thread.is_closed}
        canClose={!thread.is_closed}
      />
    </div>
  );
}
