"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Check, MessageCircle, Upload } from "lucide-react";

import {
  disputeRevisionAction,
  resolveRevisionAction,
  startRevisionAction,
  type RevisionActionState,
} from "@/lib/revisions/actions";
import { RESOLUTION_LABEL, RESOLUTION_NOTE } from "@/lib/revisions/labels";
import { Button } from "@/components/ui/button";
import type { RevisionResolution, RevisionStatus } from "@/types/db";

const initial: RevisionActionState = { error: null };

function Notice({ state }: { state: RevisionActionState }) {
  if (state.error) return <p className="text-[11px] text-danger">{state.error}</p>;
  if (state.message) return <p className="text-[11px] text-ok">{state.message}</p>;
  return null;
}

/**
 * 修正依頼への対応。
 *   未対応   … 対応方法を選ぶ（データ差し替え／指示変更／出品停止）
 *   対応中   … 該当 STEP へ行って直す → 「対応が終わった」で対応済みに（再出品も選べる）
 */
export function RevisionActions({
  id,
  status,
  resolution,
  workId,
  isListed,
}: {
  id: string;
  status: RevisionStatus;
  resolution: RevisionResolution | null;
  workId: string;
  isListed: boolean;
}) {
  const [startState, start, starting] = useActionState(startRevisionAction, initial);
  const [resolveState, resolve, resolving] = useActionState(resolveRevisionAction, initial);
  const [disputeState, dispute, disputing] = useActionState(disputeRevisionAction, initial);
  const [picked, setPicked] = useState<RevisionResolution>(resolution ?? "reupload");
  const [showDispute, setShowDispute] = useState(false);

  if (status === "resolved" || status === "cancelled") {
    return (
      <section className="flex flex-col gap-2 rounded-xl border border-line bg-white p-4">
        <p className="text-[12.5px] font-semibold text-ink">
          {status === "resolved" ? "対応済みです" : "取り消されました"}
        </p>
        {resolution && (
          <p className="text-[11.5px] text-muted-foreground">対応方法：{RESOLUTION_LABEL[resolution]}</p>
        )}
        {status === "resolved" && !isListed && resolution !== "unlist" && (
          <p className="text-[11px] text-warn">
            このサイズはまだ出品停止のままです。作品管理の STEP3 から出品に戻せます。
          </p>
        )}
      </section>
    );
  }

  const stepHref =
    picked === "instruction" ? `/studio/works/${workId}/steps/2` : `/studio/works/${workId}/steps/1`;

  return (
    <>
      {status === "open" || status === "disputed" ? (
        <form action={start} className="flex flex-col gap-2.5 rounded-xl border border-line bg-white p-4">
          <input type="hidden" name="id" value={id} />
          <h2 className="text-[12.5px] font-semibold text-ink">対応方法を選んでください</h2>
          {(["reupload", "instruction", "unlist"] as RevisionResolution[]).map((r) => (
            <label
              key={r}
              className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line px-3 py-2.5 has-[:checked]:border-brand has-[:checked]:bg-brand-soft/40"
            >
              <input
                type="radio"
                name="resolution"
                value={r}
                checked={picked === r}
                onChange={() => setPicked(r)}
                className="mt-0.5 accent-brand"
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-[11.5px] font-semibold text-ink">{RESOLUTION_LABEL[r]}</span>
                <span className="text-[10px] text-muted-foreground">{RESOLUTION_NOTE[r]}</span>
              </span>
            </label>
          ))}
          <Button type="submit" disabled={starting} className="w-full">
            {picked === "unlist" ? "出品停止にする" : "この方法で対応を始める"}
          </Button>
          <Notice state={startState} />
        </form>
      ) : (
        <section className="flex flex-col gap-2.5 rounded-xl border border-line bg-white p-4">
          <h2 className="text-[12.5px] font-semibold text-ink">
            対応中：{resolution ? RESOLUTION_LABEL[resolution] : "—"}
          </h2>
          <Button asChild variant="outline" className="w-full">
            <Link href={resolution === "instruction" ? `/studio/works/${workId}/steps/2` : `/studio/works/${workId}/steps/1`}>
              <Upload className="size-3.5" aria-hidden />
              {resolution === "instruction" ? "STEP2 で印刷指示を直す" : "STEP1 で修正データをアップロード"}
            </Link>
          </Button>

          <form action={resolve} className="flex flex-col gap-2 border-t border-line pt-2.5">
            <input type="hidden" name="id" value={id} />
            <label className="flex flex-col gap-1">
              <span className="text-[10.5px] text-muted-foreground">直した内容（運営に伝わります）</span>
              <textarea
                name="note"
                rows={2}
                maxLength={1000}
                placeholder="例：ダボ径を 0.3mm 細くしてクリアランスを確保しました"
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-[11.5px] text-ink outline-none focus:border-brand"
              />
            </label>
            <label className="flex items-center gap-2 text-[11.5px] text-ink">
              <input type="checkbox" name="relist" defaultChecked className="accent-brand" />
              このサイズを再出品する
            </label>
            <Button type="submit" disabled={resolving} className="w-full">
              <Check className="size-3.5" aria-hidden />
              対応が終わった
            </Button>
            <Notice state={resolveState} />
          </form>
        </section>
      )}

      <section className="flex flex-col gap-2 rounded-xl border border-line bg-white p-4">
        {!showDispute ? (
          <button
            type="button"
            onClick={() => setShowDispute(true)}
            className="flex items-center justify-center gap-1.5 text-[11.5px] font-semibold text-brand hover:underline"
          >
            <MessageCircle className="size-3.5" aria-hidden />
            判定に納得できない場合は運営に相談
          </button>
        ) : (
          <form action={dispute} className="flex flex-col gap-2">
            <input type="hidden" name="id" value={id} />
            <textarea
              name="note"
              rows={3}
              required
              placeholder="どこに納得できないかを書いてください（10文字以上）"
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-[11.5px] text-ink outline-none focus:border-brand"
            />
            <Button type="submit" variant="outline" disabled={disputing} className="w-full">
              運営に相談する
            </Button>
            <Notice state={disputeState} />
          </form>
        )}
      </section>
      <span hidden>{stepHref}</span>
    </>
  );
}
