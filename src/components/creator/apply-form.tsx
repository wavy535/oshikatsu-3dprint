"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Check, ExternalLink, ShieldCheck, MailCheck } from "lucide-react";

import {
  applyForCreatorAction,
  type CreatorApplyActionState,
} from "@/lib/creator/actions";
import {
  CREATOR_TERMS,
  CREATOR_TERMS_TITLE,
  CREATOR_TERMS_VERSION,
} from "@/lib/creator/terms";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const applyInitial: CreatorApplyActionState = { error: null };

/** 各セクションの見出し。番号 → 済んだら ✓ に変わる（出品4STEPの StepNav と同じ見せ方） */
function SectionHead({
  n,
  title,
  done,
  icon,
}: {
  n: number;
  title: string;
  done: boolean;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={cn(
          "flex size-6 items-center justify-center rounded-full text-sm font-semibold",
          done ? "bg-ok text-white" : "bg-brand text-white"
        )}
      >
        {done ? <Check className="size-3.5" aria-hidden /> : n}
      </span>
      <h2 className="text-lg leading-normal font-bold text-ink">{title}</h2>
      <span className="ml-auto text-line">{icon}</span>
    </div>
  );
}

/** 確認済みメールと利用規約への同意を揃えて申請する。 */
export function CreatorApplyForm({ emailVerified }: { emailVerified: boolean }) {
  const [applyState, applyAction, applying] = useActionState(applyForCreatorAction, applyInitial);
  const [agreed, setAgreed] = useState(false);
  const canSubmit = emailVerified && agreed && !applying;

  if (applyState.success) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-line bg-white px-6 py-12 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-ok/10 text-ok">
          <Check className="size-5" aria-hidden />
        </span>
        <p className="text-sm font-semibold text-ink">申請を受け付けました</p>
        <p className="text-sm leading-6 text-muted-foreground">
          運営が確認し、結果を通知でお知らせします。
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <form action={applyAction} className="flex flex-col gap-4">
        <section className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5">
          <SectionHead n={1} title="メールアドレスの確認" done={emailVerified} icon={<MailCheck className="size-4" aria-hidden />} />
          <p className="text-sm text-muted-foreground">
            {emailVerified ? "メールアドレスは確認済みです。" : "申請にはメールアドレスの確認が必要です。"}
          </p>
        </section>

        {/* 2. 利用規約 */}
        <section className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5">
          <SectionHead
            n={2}
            title="クリエイター利用規約への同意"
            done={agreed}
            icon={<ShieldCheck className="size-4" aria-hidden />}
          />
          <div className="rounded-lg border border-line bg-ground">
            <div className="flex items-center justify-between border-b border-line px-4 py-2">
              <span className="text-sm font-semibold text-ink">{CREATOR_TERMS_TITLE}</span>
              <span className="num text-sm text-muted-foreground">
                {CREATOR_TERMS_VERSION} 版
              </span>
            </div>
            <div className="max-h-56 overflow-y-auto px-4 py-3" tabIndex={0}>
              {CREATOR_TERMS.map((s) => (
                <div key={s.heading} className="mb-3 last:mb-0">
                  <h3 className="text-base leading-normal font-semibold text-ink">{s.heading}</h3>
                  {s.paragraphs.map((p, i) => (
                    <p key={i} className="mt-1 text-sm leading-6 text-muted-foreground">
                      {p}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <Link
            href="/terms/creator"
            target="_blank"
            className="inline-flex items-center gap-1 self-start text-sm text-brand hover:underline"
          >
            全文を別のタブで読む
            <ExternalLink className="size-3" aria-hidden />
          </Link>
          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line px-3 py-2.5 hover:bg-ground">
            <input
              type="checkbox"
              name="agreeTerms"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 size-4 accent-brand"
            />
            <span className="text-sm leading-6 text-ink">
              {CREATOR_TERMS_TITLE}（{CREATOR_TERMS_VERSION} 版）を読み、内容に同意します。
            </span>
          </label>
          <input type="hidden" name="termsVersion" value={CREATOR_TERMS_VERSION} />
        </section>

        {applyState.error && <p className="text-sm text-destructive">{applyState.error}</p>}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={!canSubmit}>
            {applying ? "送信中..." : "クリエイター申請を送信する"}
          </Button>
          {!canSubmit && !applying && (
            <p className="text-sm text-muted-foreground">
              {!emailVerified ? "メールアドレスを確認してください" : "利用規約に同意してください"}
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
