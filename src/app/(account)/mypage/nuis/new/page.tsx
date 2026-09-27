import { NuiForm } from "@/components/nui/nui-form";

export const metadata = { title: "ぬいを登録" };

export default function NewNuiPage() {
  return (
    <>
      <h1 className="page-title font-bold text-ink">ぬいを登録</h1>
      <NuiForm />
    </>
  );
}
