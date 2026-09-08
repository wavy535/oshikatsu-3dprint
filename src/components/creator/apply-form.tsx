"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Check, ExternalLink, ShieldCheck, Smartphone } from "lucide-react";

import {
  applyForCreatorAction,
  sendPhoneCodeAction,
  verifyPhoneCodeAction,
  type CreatorApplyActionState,
  type PhoneActionState,
} from "@/lib/creator/actions";
import {
  CREATOR_TERMS,
  CREATOR_TERMS_TITLE,
  CREATOR_TERMS_VERSION,
} from "@/lib/creator/terms";
import { CodeBoxes } from "@/components/auth/code-boxes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const FIELD =
  "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none placeholder:text-muted-foreground focus:border-brand focus:ring-3 focus:ring-brand/20";

const applyInitial: CreatorApplyActionState = { error: null };
const phoneInitial: PhoneActionState = { error: null };

const SEND_FORM = "send-phone-form";
const VERIFY_FORM = "verify-phone-form";

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
          "flex size-6 items-center justify-center rounded-full text-[10.5px] font-semibold",
          done ? "bg-ok text-white" : "bg-brand text-white"
        )}
      >
        {done ? <Check className="size-3.5" aria-hidden /> : n}
      </span>
      <h2 className="text-[14px] font-bold text-ink">{title}</h2>
      <span className="ml-auto text-line">{icon}</span>
    </div>
  );
}

/**
 * クリエイター申請。SMS 認証 → 利用規約への同意 の2段。両方済むまで送信できない。
 * 最終的な検査は DB のトリガー（0024）が行う。
 *
 * SMS の送信・認証は申請とは別の Server Action なので、別の <form> にしてある
 * （form はネストできない）。申請フォームの中に置いた入力やボタンは form="..." 属性で
 * そちらへ結びつけている。
 */
export function CreatorApplyForm({
  initialPhoneMasked,
}: {
  /** すでに SMS 認証済みなら伏せ字の番号。未認証なら null */
  initialPhoneMasked: string | null;
}) {
  const [applyState, applyAction, applying] = useActionState(applyForCreatorAction, applyInitial);
  const [sendState, sendAction, sending] = useActionState(sendPhoneCodeAction, phoneInitial);
  const [verifyState, verifyAction, verifying] = useActionState(
    verifyPhoneCodeAction,
    phoneInitial
  );

  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [agreed, setAgreed] = useState(false);
  // 「別の番号にする」を押したら、サーバーから来た認証済み表示を一度解除する
  const [changingPhone, setChangingPhone] = useState(false);
  // 「番号を入力し直す」を押したときの sendState。同じ結果オブジェクトのあいだは入力欄に戻す
  const [dismissedSend, setDismissedSend] = useState<PhoneActionState | null>(null);

  const verifiedMasked =
    verifyState.verifiedMasked ??
    sendState.verifiedMasked ??
    (changingPhone ? null : initialPhoneMasked);
  const phoneVerified = Boolean(verifiedMasked);
  const sentTo = !phoneVerified && sendState !== dismissedSend ? sendState.sentTo : undefined;

  const canSubmit = phoneVerified && agreed && !applying;

  if (applyState.success) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-line bg-white px-6 py-12 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-ok/10 text-ok">
          <Check className="size-5" aria-hidden />
        </span>
        <p className="text-sm font-semibold text-ink">申請を受け付けました</p>
        <p className="text-[12px] leading-5 text-muted-foreground">
          運営が確認し、結果を通知でお知らせします。
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* SMS の送信・認証（申請フォームの外）。中身は form 属性で結びついた入力から集まる */}
      <form id={SEND_FORM} action={sendAction} hidden aria-hidden />
      <form id={VERIFY_FORM} action={verifyAction} hidden aria-hidden>
        <input type="hidden" name="phone" value={sentTo ?? ""} />
        <input type="hidden" name="token" value={digits.join("")} />
      </form>

      <form action={applyAction} className="flex flex-col gap-4">
        {/* 1. SMS 認証 */}
        <section className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5">
          <SectionHead
            n={1}
            title="SMS で本人確認"
            done={phoneVerified}
            icon={<Smartphone className="size-4" aria-hidden />}
          />
          <p className="text-[12px] leading-5 text-muted-foreground">
            携帯電話の番号に6桁の認証コードを SMS で送ります。番号は取引の連絡に使い、
            購入者や他のクリエイターには公開されません。
          </p>

          {phoneVerified ? (
            <div className="flex items-center gap-3 rounded-lg bg-ok/10 px-3 py-2.5">
              <ShieldCheck className="size-4 text-ok" aria-hidden />
              <span className="text-sm font-semibold text-ink">認証済み</span>
              <span className="num text-sm text-ink">{verifiedMasked}</span>
              <button
                type="button"
                className="ml-auto text-[11.5px] text-brand hover:underline"
                onClick={() => {
                  setChangingPhone(true);
                  setDismissedSend(sendState);
                  setDigits(Array(6).fill(""));
                }}
              >
                別の番号にする
              </button>
            </div>
          ) : sentTo ? (
            <div className="flex flex-col gap-3">
              <p className="text-[12.5px] text-ink">
                <span className="num font-medium">{sentTo.replace(/^\+81/, "0")}</span>{" "}
                に認証コードを送りました。10分以内に入力してください。
              </p>
              <div className="max-w-[340px]">
                <CodeBoxes digits={digits} onChange={setDigits} label="認証コード" />
              </div>
              {verifyState.error && (
                <p className="text-sm text-destructive">{verifyState.error}</p>
              )}
              <div className="flex items-center gap-3">
                <Button
                  type="submit"
                  form={VERIFY_FORM}
                  size="sm"
                  disabled={verifying || digits.join("").length < 6}
                >
                  {verifying ? "確認中..." : "認証する"}
                </Button>
                {/* 再送は同じ番号で送信アクションをもう一度呼ぶ */}
                <input type="hidden" name="phone" form={SEND_FORM} value={sentTo} />
                <Button
                  type="submit"
                  form={SEND_FORM}
                  size="sm"
                  variant="ghost"
                  disabled={sending}
                >
                  {sending ? "再送しています..." : "コードを再送する"}
                </Button>
                <button
                  type="button"
                  className="ml-auto text-[11.5px] text-muted-foreground hover:text-ink hover:underline"
                  onClick={() => {
                    setDismissedSend(sendState);
                    setDigits(Array(6).fill(""));
                  }}
                >
                  番号を入力し直す
                </button>
              </div>
              {sendState.error && <p className="text-sm text-destructive">{sendState.error}</p>}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Label htmlFor="phone" className="text-[12px] text-muted-foreground">
                携帯電話の番号
              </Label>
              <div className="flex gap-2">
                <Input
                  id="phone"
                  name="phone"
                  form={SEND_FORM}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  placeholder="090-1234-5678"
                  required
                  className={cn(FIELD, "max-w-[260px]")}
                />
                <Button type="submit" form={SEND_FORM} size="sm" disabled={sending}>
                  {sending ? "送信中..." : "認証コードを送る"}
                </Button>
              </div>
              {sendState.error && <p className="text-sm text-destructive">{sendState.error}</p>}
            </div>
          )}
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
              <span className="text-[12.5px] font-semibold text-ink">{CREATOR_TERMS_TITLE}</span>
              <span className="num text-[11px] text-muted-foreground">
                {CREATOR_TERMS_VERSION} 版
              </span>
            </div>
            <div className="max-h-56 overflow-y-auto px-4 py-3" tabIndex={0}>
              {CREATOR_TERMS.map((s) => (
                <div key={s.heading} className="mb-3 last:mb-0">
                  <h3 className="text-[12px] font-semibold text-ink">{s.heading}</h3>
                  {s.paragraphs.map((p, i) => (
                    <p key={i} className="mt-1 text-[11.5px] leading-5 text-muted-foreground">
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
            className="inline-flex items-center gap-1 self-start text-[11.5px] text-brand hover:underline"
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
            <span className="text-[12.5px] leading-5 text-ink">
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
            <p className="text-[11.5px] text-muted-foreground">
              {!phoneVerified ? "SMS 認証を済ませてください" : "利用規約に同意してください"}
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
