import { CreditCard } from "lucide-react";

import { requireUser } from "@/lib/auth/guards";
import { AddressManager, type Address } from "@/components/address/address-manager";

export const metadata = { title: "配送先・お支払い" };

/**
 * Figma ④マイページ「配送先・お支払い」。
 * お支払い方法は決済（Stripe）を入れるときに足す。
 */
export default async function AddressesPage() {
  const { supabase, user } = await requireUser("/mypage/addresses");
  const { data } = await supabase
    .from("addresses")
    .select("id, recipient_name, postal_code, prefecture, city, address_line, phone, is_default")
    .eq("user_id", user.id)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  return (
    <>
      <h1 className="text-base font-bold text-ink">配送先・お支払い</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-[13px] font-semibold text-ink">配送先</h2>
        <AddressManager addresses={(data ?? []) as Address[]} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[13px] font-semibold text-ink">お支払い方法</h2>
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-line bg-white p-4">
          <CreditCard className="size-5 text-line" aria-hidden />
          <p className="text-[12px] text-muted-foreground">
            お支払い方法は決済画面で登録します（決済の実装後に、ここから管理できるようにします）。
          </p>
        </div>
      </section>
    </>
  );
}
