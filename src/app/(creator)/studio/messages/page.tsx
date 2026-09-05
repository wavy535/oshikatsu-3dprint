import Link from "next/link";
import { requireCreator } from "@/lib/auth/guards";
import { listMyCreatorThreads } from "@/features/messages/queries";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const KIND_LABEL: Record<string, string> = {
  pre_purchase: "購入前の質問",
  order: "注文について",
};

export default async function StudioMessagesPage() {
  const { user } = await requireCreator();
  const threads = await listMyCreatorThreads(user.id);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">メッセージ</h1>
      {threads.length === 0 ? (
        <p className="text-sm text-muted-foreground">まだメッセージがありません。</p>
      ) : (
        <div className="flex flex-col gap-2">
          {threads.map((t) => (
            <Link key={t.id} href={`/studio/messages/${t.id}`}>
              <Card>
                <CardContent className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">
                      {t.subject ?? t.products?.title ?? KIND_LABEL[t.kind]}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t.profiles?.display_name} ・ {new Date(t.last_message_at).toLocaleString("ja-JP")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {t.creator_unread_count > 0 && <Badge>{t.creator_unread_count}</Badge>}
                    {t.is_closed && <Badge variant="outline">クローズ済み</Badge>}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
