import { requireUser } from "@/lib/auth/guards";
import { listMyAddresses } from "@/features/addresses/queries";
import { AddressManager } from "./address-manager";

export default async function MyAddressesPage() {
  const { user } = await requireUser();
  const addresses = await listMyAddresses(user.id);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">配送先</h1>
      <AddressManager addresses={addresses} />
    </div>
  );
}
