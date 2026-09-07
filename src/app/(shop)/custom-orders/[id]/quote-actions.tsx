"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { approveQuoteAndCheckout, rejectQuote } from "@/features/custom-orders/actions";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Address = { id: string; recipient_name: string; prefecture: string; city: string };

/** Figma ③ 見積り・お支払い（2096:1389）の操作部 */
export function QuoteActions({
  customOrderId,
  addresses,
}: {
  customOrderId: string;
  addresses: Address[];
}) {
  const router = useRouter();
  const [addressId, setAddressId] = useState(addresses[0]?.id);
  const [pending, setPending] = useState(false);

  if (addresses.length === 0) {
    return (
      <Button render={<Link href="/mypage/addresses" />} variant="outline">
        配送先を登録する
      </Button>
    );
  }

  async function approve() {
    if (!addressId) return;
    setPending(true);
    const result = await approveQuoteAndCheckout(customOrderId, addressId);
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    window.location.href = result.data.url;
  }

  async function reject() {
    setPending(true);
    const result = await rejectQuote(customOrderId);
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("この見積りを見送りました");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <Select value={addressId} onValueChange={(v) => v && setAddressId(v)}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="配送先を選択">
            {(v) => {
              const a = addresses.find((x) => x.id === v);
              return a ? `${a.recipient_name}（${a.prefecture}${a.city}）` : null;
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {addresses.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.recipient_name}（{a.prefecture}
              {a.city}）
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="button" size="lg" disabled={pending || !addressId} onClick={approve}>
        {pending ? "処理中..." : "見積りを承認して決済へ"}
      </Button>
      <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={reject}>
        この見積りを見送る
      </Button>
    </div>
  );
}
