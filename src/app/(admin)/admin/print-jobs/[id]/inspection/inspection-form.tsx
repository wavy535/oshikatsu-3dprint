"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { recordInspection } from "@/features/print-jobs/actions";
import { registerShipment } from "@/features/admin/actions";
import { INSPECTION_ITEMS } from "@/features/print-jobs/schema";
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
import { cn } from "@/lib/utils";

// 値は registerShipmentSchema の enum に合わせる
const CARRIERS = [
  { value: "yamato", label: "ヤマト運輸" },
  { value: "sagawa", label: "佐川急便" },
  { value: "japanpost", label: "日本郵便" },
  { value: "other", label: "その他" },
] as const;

type Carrier = (typeof CARRIERS)[number]["value"];
type Result = "pass" | "fail_model" | "fail_print";

/**
 * Figma ④ 運営｜検品・発送登録（2083:1233）。
 * 6 項目チェック → 合否。NG がモデル側ならクリエイターへ修正依頼が飛ぶ。
 * 全項目 OK かつ他の明細も刷り終わっていれば、そのまま発送登録できる。
 */
export function InspectionForm({
  jobId,
  orderId,
  canRegisterShipment,
  alreadyInspected,
}: {
  jobId: string;
  orderId: string;
  canRegisterShipment: boolean;
  alreadyInspected: boolean;
}) {
  const router = useRouter();
  const [checks, setChecks] = useState<Record<string, boolean | null>>(
    Object.fromEntries(INSPECTION_ITEMS.map((i) => [i.key, null]))
  );
  const [comment, setComment] = useState("");
  const [reprintFee, setReprintFee] = useState("0");
  const [pending, setPending] = useState(false);
  const [inspected, setInspected] = useState(alreadyInspected);

  const [carrier, setCarrier] = useState<Carrier>("yamato");
  const [trackingNumber, setTrackingNumber] = useState("");

  const allAnswered = INSPECTION_ITEMS.every((i) => checks[i.key] !== null);
  const allPass = INSPECTION_ITEMS.every((i) => checks[i.key] === true);

  async function submit(result: Result) {
    if (!allAnswered) {
      toast.error("6項目すべてに OK / NG を付けてください");
      return;
    }
    setPending(true);
    const res = await recordInspection({
      jobId,
      result,
      checks: Object.fromEntries(
        INSPECTION_ITEMS.map((i) => [i.key, checks[i.key] === true])
      ),
      comment: comment || undefined,
      reprintFee: result === "fail_model" ? Number(reprintFee) || 0 : undefined,
    });
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    if (result === "pass") {
      toast.success("検品に合格しました");
      setInspected(true);
    } else if (result === "fail_model") {
      toast.success("クリエイターへ修正依頼を送りました");
      router.push("/admin/print-queue");
    } else {
      toast.success("印刷側NGとして未着手に戻しました");
      router.push("/admin/print-queue");
    }
    router.refresh();
  }

  async function handleShip() {
    if (!trackingNumber.trim()) {
      toast.error("追跡番号を入力してください");
      return;
    }
    setPending(true);
    const res = await registerShipment({ orderId, carrier, trackingNumber });
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("発送を確定しました");
    router.push("/admin/print-queue");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {!inspected && (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-semibold">検品チェックリスト</p>
          <ul className="flex flex-col divide-y divide-border">
            {INSPECTION_ITEMS.map((item) => (
              <li key={item.key} className="flex items-center gap-3 py-2">
                <span className="flex-1 text-[13px]">{item.label}</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    aria-pressed={checks[item.key] === true}
                    onClick={() => setChecks((p) => ({ ...p, [item.key]: true }))}
                    className={cn(
                      "flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px]",
                      checks[item.key] === true
                        ? "border-transparent bg-ok text-white"
                        : "border-border text-muted-foreground"
                    )}
                  >
                    <Check className="size-3" aria-hidden />
                    OK
                  </button>
                  <button
                    type="button"
                    aria-pressed={checks[item.key] === false}
                    onClick={() => setChecks((p) => ({ ...p, [item.key]: false }))}
                    className={cn(
                      "flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px]",
                      checks[item.key] === false
                        ? "border-transparent bg-destructive text-white"
                        : "border-border text-muted-foreground"
                    )}
                  >
                    <X className="size-3" aria-hidden />
                    NG
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">
              検品コメント（NG のときは必須。クリエイターにそのまま届きます）
            </span>
            <Textarea
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="例: 台座の柱が2本とも根元から折れている。肉厚が0.8mmしかないため印刷では成立しない。"
            />
          </label>

          {!allPass && allAnswered && (
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">
                再印刷の代行費（モデル側NGのときはクリエイター負担）
              </span>
              <Input
                type="number"
                min={0}
                value={reprintFee}
                onChange={(e) => setReprintFee(e.target.value)}
                className="w-40"
              />
            </label>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="lg"
              disabled={pending || !allAnswered || !allPass}
              onClick={() => submit("pass")}
            >
              合格にする
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending || !allAnswered || allPass}
              onClick={() => submit("fail_model")}
            >
              NG（モデル側）→ 修正依頼
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending || !allAnswered || allPass}
              onClick={() => submit("fail_print")}
            >
              NG（印刷側）→ 刷り直し
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-semibold">梱包・発送登録</p>
        {!canRegisterShipment && !inspected ? (
          <p className="text-[12.5px] text-muted-foreground">
            この注文の全明細の検品が終わると発送登録できます。
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">配送業者</span>
                <Select
                  value={carrier}
                  onValueChange={(v) => v && setCarrier(v as Carrier)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(v) => CARRIERS.find((c) => c.value === v)?.label}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {CARRIERS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">追跡番号</span>
                <Input
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  placeholder="1234-5678-9012"
                />
              </label>
            </div>
            <Button type="button" size="lg" disabled={pending} onClick={handleShip}>
              {pending ? "登録中..." : "発送を確定する"}
            </Button>
            <p className="text-[11px] text-muted-foreground">
              確定すると購入者のマイページが「発送済み」に変わります。
            </p>
          </>
        )}
      </div>
    </div>
  );
}
