"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { startCheckout } from "@/features/orders/actions";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Address = { id: string; recipient_name: string; prefecture: string; city: string };

export function CheckoutButton({
  addresses,
  disabled = false,
}: {
  addresses: Address[];
  disabled?: boolean;
}) {
  const [addressId, setAddressId] = useState(addresses[0]?.id);
  const [pending, setPending] = useState(false);

  if (addresses.length === 0) {
    return (
      <Button render={<Link href="/mypage/addresses" />} variant="outline">
        配送先を登録する
      </Button>
    );
  }

  async function handleCheckout() {
    if (!addressId) return;
    setPending(true);
    const result = await startCheckout(addressId);
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    window.location.href = result.data.url;
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
      <Button
        size="lg"
        disabled={pending || disabled || !addressId}
        onClick={handleCheckout}
      >
        {pending ? "処理中..." : "レジに進む"}
      </Button>
    </div>
  );
}
