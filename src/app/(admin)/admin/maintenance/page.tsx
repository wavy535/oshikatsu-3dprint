import { requireAdmin } from "@/lib/auth/guards";
import { MaintenanceForm } from "@/components/ops/maintenance-form";

export const metadata = { title: "通知送信・整理" };

export default async function MaintenancePage() {
  await requireAdmin();
  return (
    <section className="space-y-4 rounded-xl border border-line bg-white p-5">
      <h1 className="text-base font-bold">通知送信・整理</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        学習環境では定期実行せず、必要な時にここから通知メールを送信します。
        配信時刻を過ぎた通知を1回に最大20件処理し、期限切れの見積りと古いデータも整理します。
      </p>
      <p className="text-sm text-muted-foreground">
        アプリ内通知と、ログイン・登録時の確認メールは通常どおり利用できます。
      </p>
      <MaintenanceForm />
    </section>
  );
}
