"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { completePrintJob, startPrintJob } from "@/features/print-jobs/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Figma ④ 運営｜印刷ジョブ詳細（2080:1219）の操作部。
 * 実使用フィラメントと実印刷時間を記録して検品へ送る。
 */
export function JobActions({
  jobId,
  status,
  filaments,
  estWeightG,
  estPrintMin,
}: {
  jobId: string;
  status: string;
  filaments: { id: number; name: string }[];
  estWeightG: number | null;
  estPrintMin: number | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [weight, setWeight] = useState(String(estWeightG ?? ""));
  const [minutes, setMinutes] = useState(String(estPrintMin ?? ""));
  const [filamentId, setFilamentId] = useState<string>("none");
  const [note, setNote] = useState("");

  async function handleStart() {
    setPending(true);
    const result = await startPrintJob(jobId);
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("印刷を開始しました");
    router.refresh();
  }

  async function handleComplete() {
    setPending(true);
    const result = await completePrintJob({
      jobId,
      actualWeightG: Number(weight) || 0,
      actualPrintMin: Number(minutes) || 0,
      actualFilamentId: filamentId === "none" ? undefined : Number(filamentId),
      note: note || undefined,
    });
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("印刷完了を記録しました。検品へ進んでください");
    router.push(`/admin/print-jobs/${jobId}/inspection`);
    router.refresh();
  }

  if (status === "queued") {
    return (
      <Button type="button" size="lg" disabled={pending} onClick={handleStart}>
        {pending ? "処理中..." : "印刷を開始する"}
      </Button>
    );
  }

  if (status !== "printing") {
    return null;
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <p className="text-sm font-semibold">印刷実績を記録して検品へ</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">実使用フィラメント(g)</span>
          <Input
            type="number"
            min={0}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">実印刷時間(分)</span>
          <Input
            type="number"
            min={0}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
          />
        </label>
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">使用フィラメント</span>
          <Select value={filamentId} onValueChange={(v) => v && setFilamentId(v)}>
            <SelectTrigger className="w-full">
              <SelectValue>
                {(v) =>
                  v === "none"
                    ? "記録しない"
                    : filaments.find((f) => String(f.id) === v)?.name
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">記録しない</SelectItem>
              {filaments.map((f) => (
                <SelectItem key={f.id} value={String(f.id)}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-muted-foreground">作業メモ</span>
        <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <Button type="button" size="lg" disabled={pending} onClick={handleComplete}>
        {pending ? "記録中..." : "印刷完了 → 検品へ"}
      </Button>
    </div>
  );
}
