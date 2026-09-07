import Link from "next/link";
import { redirect } from "next/navigation";
import { Check } from "lucide-react";

import { getCheckoutContext } from "@/lib/checkout/queries";
import { cancelUnpaidOrderAction } from "@/lib/checkout/actions";
import { CheckoutForm } from "@/components/checkout/checkout-form";

export const metadata = { title: "お届け先・お支払い" };

function Step({ n, label, state }: { n: number; label: string; state: "done" | "now" | "todo" }) {
  return (
    <span className="flex items-center gap-2">
      <span
        className={`num flex size-[22px] items-center justify-center rounded-full text-[11px] font-bold ${
          state === "done"
            ? "bg-ok text-white"
            : state === "now"
              ? "bg-brand text-white"
              : "border border-line bg-ground text-muted-foreground"
        }`}
      >
        {state === "done" ? <Check className="size-3" aria-hidden /> : n}
      </span>
      <span className={`text-[12px] ${state === "todo" ? "text-muted-foreground" : "font-semibold text-ink"}`}>
        {label}
      </span>
    </span>
  );
}

/**
 * Figma ①購入フロー「決済（チェックアウト）48:796」。
 * Stripe から「戻る」で帰ってきたとき（?cancelled=注文ID）は、その支払い前の注文を取り消す。
 */
export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ cancelled?: string }>;
}) {
  const sp = await searchParams;
  if (sp.cancelled) {
    await cancelUnpaidOrderAction(sp.cancelled);
    redirect("/checkout");
  }

  const ctx = await getCheckoutContext();
  if (ctx.lines.length === 0) redirect("/cart");

  return (
    <div className="mx-auto flex w-full max-w-[1270px] flex-1 flex-col gap-5 px-6 py-6">
      <div className="flex items-center gap-2.5">
        <Link href="/cart" className="hover:opacity-80">
          <Step n={1} label="カート" state="done" />
        </Link>
        <span className="h-px w-10 bg-line" />
        <Step n={2} label="お届け先・お支払い" state="now" />
        <span className="h-px w-10 bg-line" />
        <Step n={3} label="注文完了" state="todo" />
      </div>

      <CheckoutForm
        lines={ctx.lines}
        addresses={ctx.addresses}
        totals={ctx.totals}
        stripeEnabled={ctx.stripeEnabled}
      />
    </div>
  );
}
