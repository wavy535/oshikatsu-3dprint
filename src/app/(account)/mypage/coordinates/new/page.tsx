import { requireUser } from "@/lib/auth/guards";
import { listMyNuis, listNuiSizes } from "@/features/nuis/queries";
import { CoordinateNewForm } from "./coordinate-new-form";

export default async function NewCoordinatePage() {
  const { user } = await requireUser();
  const [nuis, nuiSizes] = await Promise.all([listMyNuis(user.id), listNuiSizes()]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">コーデを投稿</h1>
      <CoordinateNewForm nuis={nuis.map((n) => ({ id: n.id, name: n.name }))} nuiSizes={nuiSizes} />
    </div>
  );
}
