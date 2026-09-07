import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { requireCreator } from "@/lib/auth/guards";
import {
  getCustomOrder,
  CUSTOM_ORDER_STATUS_LABEL,
} from "@/features/custom-orders/queries";
import { getMyCreatorProfile } from "@/features/auth/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QuoteForm } from "./quote-form";

export const metadata = { title: "オーダーメイド相談" };

export default async function StudioCustomOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user } = await requireCreator();
  const [customOrder, creatorProfile] = await Promise.all([
    getCustomOrder(id),
    getMyCreatorProfile(user.id),
  ]);
  if (!customOrder || customOrder.creator?.id !== user.id) notFound();

  const editable =
    customOrder.status === "requested" || customOrder.status === "quoted";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/studio/custom-orders"
          className="text-xs text-muted-foreground hover:text-ink"
        >
          ← 相談一覧
        </Link>
        <h1 className="text-lg font-bold text-ink">{customOrder.products?.title}</h1>
        <Badge variant={customOrder.status === "requested" ? "destructive" : "outline"}>
          {CUSTOM_ORDER_STATUS_LABEL[customOrder.status] ?? customOrder.status}
        </Badge>
        {customOrder.thread_id && (
          <Button
            render={<Link href={`/studio/messages/${customOrder.thread_id}`} />}
            variant="outline"
            size="sm"
            className="ml-auto"
          >
            <MessageSquare />
            スレッドを開く
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-line bg-white p-4">
        <p className="text-sm font-bold text-ink">
          {customOrder.buyer?.display_name} さんからの相談
        </p>
        <dl className="flex flex-col gap-1.5 text-[12.5px]">
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 text-muted-foreground">サイズ</dt>
            <dd className="text-ink">{customOrder.nui_sizes?.label ?? "指定なし"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 text-muted-foreground">カラー</dt>
            <dd className="text-ink">{customOrder.color_note ?? "指定なし"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 text-muted-foreground">加工</dt>
            <dd className="text-ink">{customOrder.finish_note ?? "指定なし"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 text-muted-foreground">希望納期</dt>
            <dd className="num text-ink">{customOrder.desired_date ?? "指定なし"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 text-muted-foreground">内容</dt>
            <dd className="leading-6 whitespace-pre-wrap text-ink">
              {customOrder.request_note}
            </dd>
          </div>
        </dl>
      </div>

      {editable ? (
        <QuoteForm
          customOrderId={customOrder.id}
          initial={{
            price: customOrder.quote_price,
            filamentG: customOrder.quote_filament_g,
            printMin: customOrder.quote_print_min,
            partCount: customOrder.quote_part_count,
            leadDays: customOrder.quote_lead_days,
            spec: customOrder.quote_spec ?? "",
            note: customOrder.quote_note ?? "",
          }}
          commissionRate={Number(creatorProfile?.commission_rate ?? 0.3)}
        />
      ) : (
        <p className="rounded-xl border border-line bg-white px-4 py-6 text-center text-[12.5px] text-muted-foreground">
          この相談は{CUSTOM_ORDER_STATUS_LABEL[customOrder.status]}のため、
          見積りの変更はできません。
        </p>
      )}
    </div>
  );
}
