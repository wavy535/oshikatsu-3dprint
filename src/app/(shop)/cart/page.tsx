import { requireUser } from "@/lib/auth/guards";
import { getCart } from "@/features/cart/queries";
import { listMyAddresses } from "@/features/addresses/queries";
import { CartList } from "./cart-list";
import { CheckoutButton } from "./checkout-button";

export default async function CartPage() {
  const { user } = await requireUser();
  const [{ items, subtotal }, addresses] = await Promise.all([
    getCart(user.id),
    listMyAddresses(user.id),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <h1 className="text-xl font-semibold">カート</h1>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">カートは空です</p>
      ) : (
        <>
          <CartList items={items} />
          <div className="flex flex-col items-end gap-4 border-t pt-4">
            <p className="text-lg font-semibold">小計 ¥{subtotal.toLocaleString()}</p>
            <div className="w-full max-w-xs">
              <CheckoutButton addresses={addresses} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
