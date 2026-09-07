import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { getMyOrder } from "@/features/orders/queries";
import { Button } from "@/components/ui/button";

export default async function CheckoutCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order: orderId } = await searchParams;
  const { user } = await requireUser();
  const order = orderId ? await getMyOrder(orderId, user.id) : null;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-ok-bg">
        <CheckCircle2 className="size-6 text-ok" aria-hidden />
      </span>
      <h1 className="text-xl font-bold text-ink">ご注文ありがとうございます</h1>
      {order && (
        <p className="num text-[13px] text-muted-foreground">
          注文番号: {order.order_number}
        </p>
      )}
      <p className="text-[13px] leading-6 text-muted-foreground">
        決済の確認が完了次第、注文詳細に反映されます。
        確定すると運営の印刷キューにジョブが積まれ、印刷が始まります。
      </p>
      <Button render={<Link href="/mypage/orders?placed=1" />}>購入履歴を見る</Button>
    </div>
  );
}
