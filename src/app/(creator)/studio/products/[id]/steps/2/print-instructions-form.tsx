"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Box } from "lucide-react";
import { savePrintInstructions } from "@/features/products/step-actions";
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

const LAYER_OPTIONS = [
  { value: "auto", label: "おまかせ" },
  { value: "z_up", label: "Z軸 上向き" },
  { value: "z_down", label: "Z軸 下向き" },
  { value: "x_flat", label: "寝かせて配置" },
] as const;

const SUPPORT_OPTIONS = [
  { value: "auto", label: "おまかせ" },
  { value: "none", label: "サポートなし" },
  { value: "normal", label: "通常サポート" },
  { value: "tree", label: "ツリーサポート" },
] as const;

export type PartRow = {
  assetId: string;
  originalName: string;
  partLabel: string;
  quantityPerItem: number;
  layerDirection: "z_up" | "z_down" | "x_flat" | "auto";
  supportType: "none" | "normal" | "tree" | "auto";
  colorSlot: number | null;
  filamentId: number | null;
  printNote: string;
};

/**
 * Figma ②出品フロー STEP2（2059:1062）。
 * ここで入れた指示がそのまま運営の印刷ジョブ詳細（2080:1219）に届く。
 */
export function PrintInstructionsForm({
  productId,
  initialParts,
  filaments,
}: {
  productId: string;
  initialParts: PartRow[];
  filaments: { id: number; name: string; color_hex: string }[];
}) {
  const router = useRouter();
  const [parts, setParts] = useState<PartRow[]>(initialParts);
  const [pending, setPending] = useState(false);

  function update(assetId: string, patch: Partial<PartRow>) {
    setParts((prev) =>
      prev.map((p) => (p.assetId === assetId ? { ...p, ...patch } : p))
    );
  }

  async function save(goNext: boolean) {
    setPending(true);
    const result = await savePrintInstructions({
      productId,
      parts: parts.map((p) => ({
        assetId: p.assetId,
        partLabel: p.partLabel || undefined,
        quantityPerItem: p.quantityPerItem,
        layerDirection: p.layerDirection,
        supportType: p.supportType,
        colorSlot: p.colorSlot ?? undefined,
        filamentId: p.filamentId ?? undefined,
        printNote: p.printNote || undefined,
      })),
    });
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("印刷指示を保存しました");
    if (goNext) {
      router.push(`/studio/products/${productId}/steps/3`);
    } else {
      router.refresh();
    }
  }

  if (parts.length === 0) {
    return (
      <p className="rounded-xl border border-line bg-white px-4 py-8 text-center text-sm text-muted-foreground">
        3Dデータがありません。STEP1 でアップロードしてください。
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {parts.map((part, i) => (
          <div
            key={part.assetId}
            className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4"
          >
            <div className="flex items-center gap-2">
              <Box className="size-4 text-brand" aria-hidden />
              <p className="text-[13px] font-bold text-ink">パーツ {i + 1}</p>
              <span className="truncate text-[11px] text-muted-foreground">
                {part.originalName}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-ink">パーツ名</span>
                <Input
                  value={part.partLabel}
                  placeholder="本体 / 台座 など"
                  onChange={(e) => update(part.assetId, { partLabel: e.target.value })}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-ink">1点あたりの個数</span>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={part.quantityPerItem}
                  onChange={(e) =>
                    update(part.assetId, {
                      quantityPerItem: Math.min(50, Math.max(1, Number(e.target.value) || 1)),
                    })
                  }
                />
              </label>

              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-ink">積層方向</span>
                <Select
                  value={part.layerDirection}
                  onValueChange={(v) =>
                    v && update(part.assetId, { layerDirection: v as PartRow["layerDirection"] })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(v) => LAYER_OPTIONS.find((o) => o.value === v)?.label}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {LAYER_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-ink">サポート</span>
                <Select
                  value={part.supportType}
                  onValueChange={(v) =>
                    v && update(part.assetId, { supportType: v as PartRow["supportType"] })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(v) => SUPPORT_OPTIONS.find((o) => o.value === v)?.label}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORT_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-ink">
                  色スロット（3MFの色定義に対応）
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {[1, 2, 3, 4].map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() =>
                        update(part.assetId, {
                          colorSlot: part.colorSlot === slot ? null : slot,
                        })
                      }
                      aria-pressed={part.colorSlot === slot}
                      className={`rounded-md border px-2.5 py-1 text-[11px] ${
                        part.colorSlot === slot
                          ? "border-brand bg-brand-soft text-accent-foreground"
                          : "border-line bg-white text-muted-foreground"
                      }`}
                    >
                      スロット{slot}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-ink">
                  割り当てるフィラメント
                </span>
                <Select
                  value={part.filamentId != null ? String(part.filamentId) : "none"}
                  onValueChange={(v) =>
                    v && update(part.assetId, { filamentId: v === "none" ? null : Number(v) })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(v) =>
                        v === "none"
                          ? "指定なし（運営におまかせ）"
                          : filaments.find((f) => String(f.id) === v)?.name
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">指定なし（運営におまかせ）</SelectItem>
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
              <span className="text-[11px] font-medium text-ink">
                このパーツへの指示（運営だけが見ます）
              </span>
              <Textarea
                rows={2}
                value={part.printNote}
                placeholder="例: 底面は必ずブリム付きで。細い装飾は折れやすいので注意。"
                onChange={(e) => update(part.assetId, { printNote: e.target.value })}
              />
            </label>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="outline" disabled={pending} onClick={() => save(false)}>
          保存する
        </Button>
        <Button type="button" disabled={pending} onClick={() => save(true)}>
          {pending ? "保存中..." : "次へ（作品情報）"}
        </Button>
      </div>
    </div>
  );
}
