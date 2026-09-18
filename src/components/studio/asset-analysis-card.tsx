import { AlertTriangle, CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import type { getAnalysisDraft } from "@/lib/works/studio-queries";
import { cn } from "@/lib/utils";

type Asset = NonNullable<Awaited<ReturnType<typeof getAnalysisDraft>>>["work_assets"][number];

// 検証項目の見出し。コードは src/lib/print の解析が出すもの。
const CHECK_LABEL: Record<string, string> = {
  manifold: "閉じたメッシュ",
  normals: "面の向き",
  self_intersection: "自己交差",
  min_thickness: "肉厚",
  unit_scale: "単位",
  build_size: "造形サイズ",
  batch_count: "バッチ数",
  color_info: "色情報",
  parse: "ファイルの読み取り",
};

const SEVERITY_ICON = {
  ok: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
} as const;

const SEVERITY_STYLE = {
  ok: "text-ok",
  warning: "text-warn",
  error: "text-danger",
} as const;

export function AssetAnalysisCard({ asset }: { asset: Asset }) {
  const issues = asset.work_validation_issues ?? [];
  const objects = [...(asset.work_asset_objects ?? [])].sort((a, b) => a.object_index - b.object_index);
  return <div className="flex min-w-0 flex-col gap-3">
          <section className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[13px] font-semibold text-ink">自動検証の結果</h2>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
                  asset.validation_status === "passed"
                    ? "bg-ok-bg text-ok"
                    : asset.validation_status === "warning"
                      ? "bg-warn-bg text-warn"
                      : "bg-danger-bg text-danger"
                )}
              >
                {asset.validation_status === "passed"
                  ? "問題なし"
                  : asset.validation_status === "warning"
                    ? "注意あり"
                    : "修正が必要"}
              </span>
              <span className="num ml-auto min-w-0 break-all text-[11px] text-muted-foreground">
                {asset.file_name}（{Math.round((asset.file_size_bytes ?? 0) / 1024)} KB）
              </span>
            </div>

            <ul className="flex flex-col">
              {issues.map((issue) => {
                const Icon = SEVERITY_ICON[issue.severity as keyof typeof SEVERITY_ICON] ?? CircleDashed;
                return (
                  <li
                    key={issue.id}
                    className="flex items-start gap-2 border-b border-line/70 py-2 last:border-b-0"
                  >
                    <Icon
                      className={cn(
                        "mt-0.5 size-4 shrink-0",
                        SEVERITY_STYLE[issue.severity as keyof typeof SEVERITY_STYLE]
                      )}
                      aria-hidden
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[12.5px] text-ink">
                        {CHECK_LABEL[issue.code] ?? issue.code}
                      </span>
                      <span className="text-[11.5px] text-muted-foreground">{issue.message}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
            <h2 className="text-[13px] font-semibold text-ink">読み取った内容</h2>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                ["パーツ数", `${asset.object_count}`],
                ["三角形数", (asset.triangle_count ?? 0).toLocaleString("ja-JP")],
                [
                  "パーツ外形（参考）",
                  `${asset.bbox_x_mm ?? "—"} × ${asset.bbox_y_mm ?? "—"} × ${asset.bbox_z_mm ?? "—"} mm`,
                ],
              ].map(([label, value]) => (
                <div key={label} className="flex flex-col gap-0.5">
                  <dt className="text-[10.5px] text-muted-foreground">{label}</dt>
                  <dd className="num text-[12.5px] text-ink">{value}</dd>
                </div>
              ))}
            </dl>

            {objects.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-[11.5px]">
                  <thead>
                    <tr className="border-b border-line text-[10.5px] text-muted-foreground">
                      <th className="py-1.5 text-left font-semibold">パーツ</th>
                      <th className="py-1.5 text-right font-semibold">寸法（mm）</th>
                      <th className="py-1.5 text-right font-semibold">三角形</th>
                      <th className="py-1.5 text-right font-semibold">最小肉厚</th>
                    </tr>
                  </thead>
                  <tbody>
                    {objects.map((o) => (
                      <tr key={o.id} className="border-b border-line/70 last:border-b-0">
                        <td className="py-1.5 text-ink">{o.name}</td>
                        <td className="num py-1.5 text-right text-muted-foreground">
                          {o.bbox_x_mm} × {o.bbox_y_mm} × {o.bbox_z_mm}
                        </td>
                        <td className="num py-1.5 text-right text-muted-foreground">
                          {(o.triangle_count ?? 0).toLocaleString("ja-JP")}
                        </td>
                        <td className="num py-1.5 text-right text-muted-foreground">
                          {o.min_wall_thickness_mm ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

  </div>;
}
