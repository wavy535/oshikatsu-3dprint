import Link from "next/link";
import { Box, Coins, Package } from "lucide-react";

import { requireUser } from "@/lib/auth/guards";
import { maskPhone } from "@/lib/creator/phone";
import { CreatorApplyForm } from "@/components/creator/apply-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata = { title: "クリエイター登録" };

const STATUS_LABEL: Record<string, string> = {
  pending: "審査中",
  approved: "承認済み",
  rejected: "却下",
};

/**
 * クリエイター登録（申請）。マイページの器の中に出す。
 * 申請には SMS 認証と利用規約への同意が要る。判定は DB のトリガー（0024）が最終的に行う。
 */
export default async function CreatorApplyPage() {
  const { supabase, user } = await requireUser("/creator/apply");

  const [{ data: profile }, { data: applications }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).single(),
    supabase
      .from("creator_applications")
      .select("id, status, message, admin_note, created_at, reviewed_at, terms_version")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const latestPending = applications?.find((a) => a.status === "pending");
  const phoneMasked = user.phone_confirmed_at ? maskPhone(user.phone) : null;

  return (
    <>
      <div className="flex items-center gap-3">
        <h1 className="text-base font-bold text-ink">クリエイター登録</h1>
        {profile?.role === "buyer" && !latestPending && (
          <span className="text-[12px] text-muted-foreground">申請 → 運営の審査 → 承認</span>
        )}
      </div>

      {profile?.role !== "buyer" ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-white px-6 py-12 text-center">
          <p className="text-sm font-semibold text-ink">
            {profile?.role === "creator"
              ? "すでにクリエイターとして登録されています"
              : "このアカウントは申請の対象外です"}
          </p>
          {profile?.role === "creator" && (
            <Button asChild size="sm">
              <Link href="/studio/works">作品管理へ</Link>
            </Button>
          )}
        </div>
      ) : latestPending ? (
        <div className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
          <div className="flex items-center gap-2">
            <Badge variant="brand">審査中</Badge>
            <span className="num text-[12px] text-muted-foreground">
              申請日 {new Date(latestPending.created_at).toLocaleDateString("ja-JP")}
            </span>
          </div>
          <p className="text-sm leading-6 whitespace-pre-wrap text-ink">{latestPending.message}</p>
          <p className="text-[12px] text-muted-foreground">
            運営が内容を確認しています。結果は通知でお知らせします（通常1〜3営業日）。
          </p>
        </div>
      ) : (
        <>
          {/* できるようになること。Top の3カードと同じ骨格 */}
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              {
                icon: <Box className="size-4" aria-hidden />,
                title: "3Dデータを出品",
                body: "3MF / STL を登録するだけ。自動検証とサイズ展開で 10 / 15 / 20cm に出し分け。",
              },
              {
                icon: <Package className="size-4" aria-hidden />,
                title: "印刷・発送は運営",
                body: "プリンタも材料も梱包も不要。検品して発送するところまで運営が代行。",
              },
              {
                icon: <Coins className="size-4" aria-hidden />,
                title: "受取は実費精算",
                body: "支払額から印刷と送料の実費を引いた残りの 80% が受取。振込は申請制。",
              },
            ].map((c) => (
              <div key={c.title} className="flex flex-col gap-2 rounded-xl border border-line bg-white p-4">
                <span className="flex size-7 items-center justify-center rounded-lg bg-brand-soft text-brand">
                  {c.icon}
                </span>
                <p className="text-[12.5px] font-semibold text-ink">{c.title}</p>
                <p className="text-[11.5px] leading-5 text-muted-foreground">{c.body}</p>
              </div>
            ))}
          </div>

          <CreatorApplyForm initialPhoneMasked={phoneMasked} />
        </>
      )}

      {applications && applications.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-[12.5px] font-semibold text-ink">申請履歴</h2>
          <div className="overflow-hidden rounded-xl border border-line bg-white">
            {applications.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-3 border-b border-line px-4 py-2.5 text-[12.5px] last:border-b-0"
              >
                <span className="num text-ink">
                  {new Date(a.created_at).toLocaleDateString("ja-JP")}
                </span>
                <span className="text-muted-foreground">{STATUS_LABEL[a.status]}</span>
                {a.terms_version && (
                  <span className="num text-[11px] text-muted-foreground">
                    規約 {a.terms_version} 版に同意
                  </span>
                )}
                {a.status === "rejected" && a.admin_note && (
                  <span className="ml-auto text-[11.5px] text-muted-foreground">
                    運営より：{a.admin_note}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
