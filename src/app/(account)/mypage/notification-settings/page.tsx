import { getNotificationPreferences } from "@/lib/notifications/queries";
import { PreferenceToggle } from "@/components/notification/preference-toggle";

export const metadata = { title: "通知設定" };

/**
 * Figma ④マイページ「通知設定」。
 * 取引に関わる通知（注文・発送 / クリエイター）のアプリ内通知は
 * DBの check 制約でオフにできないので、UIも常時オンで出す。
 */
export default async function NotificationSettingsPage() {
  const { kinds, email } = await getNotificationPreferences();

  return (
    <>
      <h1 className="text-base font-bold text-ink">通知設定</h1>
      <p className="rounded-lg bg-brand-soft px-3 py-2 text-[12px] leading-5 text-accent-foreground">
        注文・発送とクリエイター向けの通知は、届かないこと自体がトラブルになるためオフにできません。
      </p>

      <div className="overflow-hidden rounded-xl border border-line bg-white">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-line text-[11px] text-muted-foreground">
              <th className="px-4 py-2.5 text-left font-semibold">種類</th>
              <th className="px-3 py-2.5 text-center font-semibold">アプリ内</th>
              <th className="px-3 py-2.5 text-center font-semibold">メール</th>
              <th className="px-3 py-2.5 text-center font-semibold">プッシュ</th>
            </tr>
          </thead>
          <tbody>
            {kinds.map((k) => (
              <tr key={k.kind} className="border-b border-line/70 last:border-b-0">
                <td className="px-4 py-3 text-ink">{k.label}</td>
                <td className="px-3 py-3">
                  <div className="flex justify-center">
                    <PreferenceToggle
                      kind={k.kind}
                      channel="in_app"
                      on={k.inApp}
                      locked={k.locked}
                      label={`${k.label}のアプリ内通知`}
                    />
                  </div>
                </td>
                <td className="px-3 py-3">
                  <div className="flex justify-center">
                    <PreferenceToggle
                      kind={k.kind}
                      channel="email"
                      on={k.email}
                      label={`${k.label}のメール通知`}
                    />
                  </div>
                </td>
                <td className="px-3 py-3">
                  <div className="flex justify-center">
                    <PreferenceToggle
                      kind={k.kind}
                      channel="push"
                      on={k.push}
                      label={`${k.label}のプッシュ通知`}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11.5px] text-muted-foreground">
        メールの宛先: <span className="text-ink">{email}</span>
      </p>
      <p className="text-[11.5px] text-muted-foreground">
        学習環境の通知メールは、管理者が送信操作をした時に届きます。
        登録時の確認メールは、その場で送信します。
      </p>
    </>
  );
}
