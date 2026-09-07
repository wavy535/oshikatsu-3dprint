"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Check, MessageCircle } from "lucide-react";

import { acceptQuoteAction, declineQuoteAction, type CustomOrderActionState } from "@/lib/custom-orders/actions";
import { Button } from "@/components/ui/button";

const initial: CustomOrderActionState = { error: null };

/** 買う人が見積りに答える：承認して支払いへ／修正を依頼（メッセージ）／辞退。 */
export function QuoteActions({
  quoteId,
  requestId,
  creatorId,
  expired,
}: {
  quoteId: string;
  requestId: string;
  creatorId: string;
  expired: boolean;
}) {
  const [acceptState, accept, accepting] = useActionState(acceptQuoteAction, initial);
  const [declineState, decline, declining] = useActionState(declineQuoteAction, initial);

  return (
    <div className="flex flex-col gap-2">
      <form action={accept}>
        <input type="hidden" name="quoteId" value={quoteId} />
        <Button type="submit" size="lg" className="w-full" disabled={accepting || expired}>
          <Check className="size-4" aria-hidden />
          承認して支払いに進む
        </Button>
      </form>
      <Button asChild variant="outline" className="w-full">
        <Link href={`/mypage/messages?with=${creatorId}`}>
          <MessageCircle className="size-3.5" aria-hidden />
          修正を依頼する（メッセージ）
        </Link>
      </Button>
      <form action={decline} className="flex justify-center">
        <input type="hidden" name="quoteId" value={quoteId} />
        <input type="hidden" name="requestId" value={requestId} />
        <button type="submit" disabled={declining || expired} className="text-[11px] text-danger hover:underline disabled:opacity-50">
          この見積りを辞退する
        </button>
      </form>
      {(acceptState.error || declineState.error) && (
        <p className="text-[11px] text-danger">{acceptState.error ?? declineState.error}</p>
      )}
      {declineState.message && <p className="text-[11px] text-ok">{declineState.message}</p>}
    </div>
  );
}
