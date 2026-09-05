import Link from "next/link";
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
    <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">ご注文ありがとうございます</h1>
      {order && <p className="text-sm text-muted-foreground">注文番号: {order.order_number}</p>}
      <p className="text-sm text-muted-foreground">
        決済の確認が完了次第、注文詳細に反映されます。しばらくしてからご確認ください。
      </p>
      <Button render={<Link href="/mypage/orders" />}>注文一覧を見る</Button>
    </div>
  );
}
