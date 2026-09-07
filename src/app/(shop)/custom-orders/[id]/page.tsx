import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock, Layers, MessageSquare, Weight } from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import {
  getCustomOrder,
  CUSTOM_ORDER_STATUS_LABEL,
} from "@/features/custom-orders/queries";
import { listMyAddresses } from "@/features/addresses/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QuoteActions } from "./quote-actions";

export const metadata = { title: "オーダーメイド見積り" };

const SHIPPING_FEE = Number(process.env.DEFAULT_SHIPPING_FEE ?? 800);

export default async function CustomOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user } = await requireUser();
  const [customOrder, addresses] = await Promise.all([
    getCustomOrder(id),
    listMyAddresses(user.id),
  ]);
  if (!customOrder) notFound();

  const quoted = customOrder.quote_price != null;
  const canApprove =
    customOrder.status === "quoted" || customOrder.status === "approved";

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-6 py-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`/products/${customOrder.products?.slug}`}
          className="text-xs text-muted-foreground hover:text-ink"
        >
          ← {customOrder.products?.title}
        </Link>
        <h1 className="text-lg font-bold text-ink">オーダーメイド見積り</h1>
        <Badge variant={canApprove ? "default" : "outline"}>
          {CUSTOM_ORDER_STATUS_LABEL[customOrder.status] ?? customOrder.status}
        </Badge>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="flex flex-1 flex-col gap-4">
          {/* 確定仕様 */}
          <div className="flex flex-col gap-2 rounded-xl border border-line bg-white p-4">
            <p className="text-sm font-bold text-ink">確定仕様</p>
            {quoted ? (
              <p className="text-[13px] leading-6 whitespace-pre-wrap text-ink">
                {customOrder.quote_spec || "（クリエイターからの記載はありません）"}
              </p>
            ) : (
              <p className="text-[12px] text-muted-foreground">
                クリエイターの見積り待ちです。返信があるとここに表示されます。
              </p>
            )}
          </div>

          {/* 相談時の希望 */}
          <div className="flex flex-col gap-2 rounded-xl border border-line bg-white p-4">
            <p className="text-sm font-bold text-ink">相談時の希望</p>
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
        </div>

        {/* 金額パネル */}
        <aside className="flex h-fit w-full flex-col gap-3 rounded-xl border border-line bg-white p-4 lg:w-80">
          <p className="text-sm font-bold text-ink">お支払い</p>
          {quoted ? (
            <>
              <div className="flex items-baseline gap-2">
                <span className="num text-2xl font-bold text-brand">
                  ¥{customOrder.quote_price!.toLocaleString()}
                </span>
                <span className="text-[10.5px] text-muted-foreground">（税込・送料別）</span>
              </div>

              <ul className="flex flex-col gap-1.5 rounded-lg bg-ground px-3 py-2.5 text-[11.5px]">
                <li className="flex items-center gap-2">
                  <Weight className="size-3.5 text-muted-foreground" aria-hidden />
                  <span className="text-muted-foreground">フィラメント量</span>
                  <span className="flex-1" />
                  <span className="num text-ink">
                    {customOrder.quote_filament_g != null
                      ? `${customOrder.quote_filament_g}g`
                      : "—"}
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <Clock className="size-3.5 text-muted-foreground" aria-hidden />
                  <span className="text-muted-foreground">造形時間</span>
                  <span className="flex-1" />
                  <span className="num text-ink">
                    {customOrder.quote_print_min != null
                      ? `約${Math.round(customOrder.quote_print_min / 60)}時間`
                      : "—"}
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <Layers className="size-3.5 text-muted-foreground" aria-hidden />
                  <span className="text-muted-foreground">パーツ数</span>
                  <span className="flex-1" />
                  <span className="num text-ink">
                    {customOrder.quote_part_count ?? "—"}
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <Clock className="size-3.5 text-muted-foreground" aria-hidden />
                  <span className="text-muted-foreground">お届け目安</span>
                  <span className="flex-1" />
                  <span className="num text-ink">
                    {customOrder.quote_lead_days != null
                      ? `${customOrder.quote_lead_days}日`
                      : "—"}
                  </span>
                </li>
              </ul>

              <dl className="flex flex-col gap-1 border-t border-line pt-2 text-[12.5px]">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">送料</dt>
                  <dd className="num text-ink">¥{SHIPPING_FEE.toLocaleString()}</dd>
                </div>
                <div className="flex items-baseline justify-between">
                  <dt className="font-semibold text-ink">合計</dt>
                  <dd className="num text-lg font-bold text-brand">
                    ¥{(customOrder.quote_price! + SHIPPING_FEE).toLocaleString()}
                  </dd>
                </div>
              </dl>

              {customOrder.quote_note && (
                <p className="rounded-lg bg-ground px-3 py-2 text-[11px] leading-4 text-muted-foreground">
                  {customOrder.quote_note}
                </p>
              )}

              {canApprove ? (
                <QuoteActions customOrderId={customOrder.id} addresses={addresses} />
              ) : (
                <p className="text-[11.5px] text-muted-foreground">
                  {customOrder.status === "paid"
                    ? "決済が完了しています。進捗は購入履歴から確認できます。"
                    : "この見積りは終了しています。"}
                </p>
              )}
            </>
          ) : (
            <p className="text-[12px] text-muted-foreground">
              見積りが届くと金額の内訳がここに出ます。
            </p>
          )}

          {customOrder.thread_id && (
            <Button
              render={<Link href={`/mypage/messages/${customOrder.thread_id}`} />}
              variant="outline"
              size="sm"
            >
              <MessageSquare />
              相談スレッドを開く
            </Button>
          )}
        </aside>
      </div>
    </div>
  );
}
