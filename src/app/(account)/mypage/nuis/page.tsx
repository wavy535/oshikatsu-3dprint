import { requireUser } from "@/lib/auth/guards";
import { listMyNuis, listNuiSizes } from "@/features/nuis/queries";
import { NuiManager } from "./nui-manager";

export default async function MyNuisPage() {
  const { user } = await requireUser();
  const [nuis, sizes] = await Promise.all([listMyNuis(user.id), listNuiSizes()]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">マイぬい</h1>
      <NuiManager nuis={nuis} sizes={sizes} />
    </div>
  );
}
