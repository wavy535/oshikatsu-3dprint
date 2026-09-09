import { ShieldCheck } from "lucide-react";

import { requireAdmin } from "@/lib/auth/guards";
import { listAdminMembers } from "@/lib/ops/members-queries";
import { shortDateTime } from "@/lib/ops/labels";
import { AddMemberForm, RevokeMemberButton } from "@/components/ops/member-forms";
import { Pill } from "@/components/ops/status-badge";
import { Card, StatCard, TD, TH } from "@/components/ops/stat-card";

export const metadata = { title: "運営メンバー" };

/**
 * 運営メンバーの一覧と追加・解除。
 * これまで profiles.role を SQL で立てる以外に手段が無かったもの。
 * 役割の書き換えは DBの管理者用関数だけが行い、一般ユーザーの自己昇格はトリガーで止めている。
 */
export default async function AdminMembersPage() {
  const [{ user }, members] = await Promise.all([requireAdmin(), listAdminMembers()]);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="運営メンバー" tone="info" value={members.length} note="運営コンソールを操作できる人" />
      </div>

      <div className="flex flex-col gap-4 xl:flex-row">
        <div className="min-w-0 flex-1 overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full min-w-[560px] border-collapse text-[11px]">
            <thead>
              <tr className="bg-ground text-[10.5px] text-muted-foreground">
                <th className={TH}>名前</th>
                <th className={TH}>メールアドレス</th>
                <th className={TH}>登録日</th>
                <th className={`${TH} text-right`}></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const isSelf = m.id === user.id;
                return (
                  <tr key={m.id} className="border-t border-line">
                    <td className={`${TD} text-ink`}>
                      <span className="flex items-center gap-2">
                        <ShieldCheck className="size-3.5 text-brand" aria-hidden />
                        <span className="font-semibold">{m.display_name}</span>
                        {isSelf && <Pill tone="info">自分</Pill>}
                      </span>
                    </td>
                    <td className={`${TD} text-ink`}>{m.email}</td>
                    <td className={`${TD} num text-muted-foreground`}>{shortDateTime(m.created_at)}</td>
                    <td className={`${TD} text-right`}>{!isSelf && <RevokeMemberButton userId={m.id} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex w-full flex-col gap-3 xl:w-80 xl:flex-none">
          <Card title="メンバーを追加">
            <AddMemberForm />
          </Card>
          <Card title="解除したときの役割">
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              解除すると、追加する前の役割（クリエイター／購入者）に戻ります。
              自分自身は解除できません（運営が0人になることはありません）。
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
