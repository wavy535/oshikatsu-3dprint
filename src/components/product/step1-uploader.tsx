"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, CircleDashed, Upload } from "lucide-react";
import { uploadAndValidateAsset } from "@/features/products/step-actions";
import type { CheckStatus, MeshAnalysis } from "@/features/products/mesh-validation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<CheckStatus, { icon: React.ElementType; className: string; label: string }> =
  {
    pass: { icon: CheckCircle2, className: "text-ok", label: "OK" },
    warn: { icon: AlertTriangle, className: "text-warn", label: "要確認" },
    fail: { icon: AlertTriangle, className: "text-danger", label: "NG" },
    skipped: { icon: CircleDashed, className: "text-muted-foreground", label: "未判定" },
  };

export type SizePreview = {
  label: string;
  price: number;
  agencyFee: number;
  estPrintMin: number | null;
  isActive: boolean;
  unavailableReason: string | null;
};

/**
 * Figma ②出品フロー STEP1（2058:1033 / エラー時 2086:1314）。
 * 左でアップロードと 7 項目の検証結果、右でサイズ展開と代行費の自動算出を見せる。
 */
export function Step1Uploader({
  productId,
  initialAnalysis,
  sizePreview,
}: {
  productId?: string;
  initialAnalysis?: MeshAnalysis | null;
  sizePreview: SizePreview[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [analysis, setAnalysis] = useState<MeshAnalysis | null>(initialAnalysis ?? null);
  const [currentProductId, setCurrentProductId] = useState(productId);
  const [pending, setPending] = useState(false);

  async function handleFile(file: File) {
    setPending(true);
    const fd = new FormData();
    fd.set("file", file);
    if (currentProductId) fd.set("productId", currentProductId);
    const result = await uploadAndValidateAsset(fd);
    setPending(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setAnalysis(result.data.analysis);
    setCurrentProductId(result.data.productId);
    if (result.data.analysis.passed) {
      toast.success("自動検証を通過しました");
    } else {
      toast.error("検証で問題が見つかりました");
    }
    // 新規投稿（/studio/products/new）はここで下書きが生まれる。
    // サイズ展開はサーバー側で読むので、下書きの STEP1 に移ってから描き直す。
    if (!productId) {
      router.replace(`/studio/products/${result.data.productId}/steps/1`);
    }
    router.refresh();
  }

  const failures = analysis?.checks.filter((c) => c.status === "fail" && c.howToFix) ?? [];

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      {/* 左: アップロードと検証結果 */}
      <div className="flex flex-1 flex-col gap-4">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line bg-white px-6 py-8">
          <Upload className="size-7 text-muted-foreground" aria-hidden />
          <p className="text-[13px] font-semibold text-ink">
            3Dデータ（STL / 3MF / OBJ / STEP）をアップロード
          </p>
          <p className="text-[11px] text-muted-foreground">
            アップロードすると 7 項目を自動で検証します（最大 200MB）
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".stl,.3mf,.obj,.step"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            disabled={pending}
            onClick={() => inputRef.current?.click()}
          >
            {pending ? "検証中..." : "ファイルを選ぶ"}
          </Button>
        </div>

        {analysis && (
          <div className="flex flex-col gap-2 rounded-xl border border-line bg-white p-4">
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold text-ink">自動検証の結果</p>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                  analysis.passed ? "bg-ok-bg text-ok" : "bg-danger-bg text-danger"
                )}
              >
                {analysis.passed ? "STEP2 へ進めます" : "修正が必要です"}
              </span>
              {analysis.triangleCount > 0 && (
                <span className="num ml-auto text-[11px] text-muted-foreground">
                  三角形 {analysis.triangleCount.toLocaleString()}
                </span>
              )}
            </div>

            <ul className="flex flex-col divide-y divide-line">
              {analysis.checks.map((c) => {
                const s = STATUS_STYLE[c.status];
                const Icon = s.icon;
                return (
                  <li key={c.key} className="flex items-start gap-2.5 py-2">
                    <Icon className={cn("mt-0.5 size-4 shrink-0", s.className)} aria-hidden />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[12.5px] font-semibold text-ink">{c.label}</span>
                      <span className="text-[11px] leading-4 text-muted-foreground">
                        {c.detail}
                      </span>
                    </div>
                    <span className={cn("text-[11px] font-semibold", s.className)}>
                      {s.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {failures.length > 0 && (
          <div className="flex flex-col gap-2 rounded-xl border border-[color:var(--danger)]/30 bg-danger-bg/40 p-4">
            <p className="text-sm font-bold text-danger">修正が必要な問題</p>
            <table className="w-full text-left text-[11.5px]">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="w-32 pb-1 font-medium">項目</th>
                  <th className="pb-1 font-medium">直し方</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--danger)]/15">
                {failures.map((c) => (
                  <tr key={c.key}>
                    <td className="py-1.5 align-top font-semibold text-ink">{c.label}</td>
                    <td className="py-1.5 leading-5 text-ink">{c.howToFix}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 右: サイズ展開と代行費 */}
      <aside className="flex h-fit w-full flex-col gap-3 rounded-xl border border-line bg-white p-4 lg:w-80">
        <p className="text-sm font-bold text-ink">サイズ展開と印刷代行費</p>
        <p className="text-[11px] leading-4 text-muted-foreground">
          ぬいサイズの高さ比から材料と造形時間を見積もった自動算出です。
          販売価格と在庫は STEP3 で決めます。
        </p>
        {sizePreview.length === 0 ? (
          <p className="rounded-lg bg-ground px-3 py-4 text-center text-[11px] text-muted-foreground">
            検証を通過すると、ここにサイズ展開が並びます
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sizePreview.map((s) => (
              <li
                key={s.label}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2",
                  s.isActive ? "border-line bg-white" : "border-line bg-ground"
                )}
              >
                <span
                  className={cn(
                    "text-[13px] font-bold",
                    s.isActive ? "text-ink" : "text-muted-foreground"
                  )}
                >
                  {s.label}
                </span>
                <span className="flex-1" />
                {s.isActive ? (
                  <div className="flex flex-col items-end">
                    <span className="num text-[11px] font-semibold text-ink">
                      代行費 ¥{s.agencyFee.toLocaleString()}
                    </span>
                    {s.estPrintMin && (
                      <span className="num text-[10px] text-muted-foreground">
                        印刷 約{Math.round(s.estPrintMin / 60)}時間
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-[10.5px] text-muted-foreground">
                    {s.unavailableReason ?? "取扱なし"}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        <Button
          type="button"
          size="lg"
          disabled={!currentProductId || !analysis?.passed}
          onClick={() => router.push(`/studio/products/${currentProductId}/steps/2`)}
        >
          次へ（印刷指示）
        </Button>
        {analysis && !analysis.passed && (
          <p className="text-[11px] text-muted-foreground">
            NG が解消するまで STEP2 へは進めません。修正したデータを上げ直してください。
          </p>
        )}
      </aside>
    </div>
  );
}
