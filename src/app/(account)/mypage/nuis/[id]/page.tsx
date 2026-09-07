import { notFound } from "next/navigation";

import { getMyNui } from "@/lib/nuis/queries";
import { NuiForm } from "@/components/nui/nui-form";

export const metadata = { title: "ぬいを編集" };

export default async function EditNuiPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const nui = await getMyNui(id);
  if (!nui) notFound();

  return (
    <>
      <h1 className="text-base font-bold text-ink">{nui.name} を編集</h1>
      <NuiForm nui={nui} />
    </>
  );
}
