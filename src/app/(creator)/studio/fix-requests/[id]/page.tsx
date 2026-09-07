import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, MessageSquare, Sliders, Upload } from "lucide-react";
import { requireCreator } from "@/lib/auth/guards";
import { getMyFixRequest } from "@/features/print-jobs/queries";
import type { MeshCheck } from "@/features/products/mesh-validation";
import { Badge } from "@/components/ui/badge";
import { ResolveFixRequestButton } from "./resolve-button";

export const metadata = { title: "作品の修正依頼" };

const CHOICES = [
  {
    icon: Upload,
    title: "データを修正して差し替える",
    body: "STEP1 に戻って修正したファイルを上げ直します。自動検証をやり直します。",
    href: (productId: string) => `/studio/products/${productId}/steps/1`,
    cta: "STEP1 へ",
  },
  {
    icon: Sliders,
    title: "印刷指示だけ変更する",
    body: "データはそのままに、積層方向やサポートの指示を変えて再印刷を依頼します。",
    href: (productId: string) => `/studio/products/${productId}/steps/2`,
    cta: "STEP2 へ",
  },
  {
    icon: MessageSquare,
    title: "運営に相談する",
    body: "原因の切り分けに迷う場合は、検品担当へ直接聞けます。",
    href: () => "/studio/messages",
    cta: "メッセージへ",
  },
];

export default async function FixRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user } = await requireCreator();
  const request = await getMyFixRequest(id, user.id);
  if (!request) notFound();

  const productId = request.products?.id ?? "";
  const validation = [...(request.products?.product_asset_validations ?? [])].at(-1);
  const checks = (validation?.checks ?? []) as unknown as MeshCheck[];
  const flagged = checks.filter((c) => c.status === "fail" || c.status === "warn");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/studio/fix-requests"
          className="text-xs text-muted-foreground hover:text-ink"
        >
          ← 修正依頼一覧
        </Link>
        <h1 className="text-lg font-bold text-ink">{request.products?.title}</h1>
        <Badge variant={request.status === "open" ? "destructive" : "outline"}>
          {request.status === "open" ? "対応待ち" : "対応済み"}
        </Badge>
        {request.status === "open" && (
          <span className="ml-auto">
            <ResolveFixRequestButton id={request.id} />
          </span>
        )}
      </div>

      {/* 検品担当のコメント */}
      <div className="flex flex-col gap-2 rounded-xl border border-[color:var(--danger)]/30 bg-danger-bg/40 p-4">
        <p className="flex items-center gap-1.5 text-sm font-bold text-danger">
          <AlertTriangle className="size-4" aria-hidden />
          検品担当のコメント
        </p>
        <p className="text-[13px] leading-6 whitespace-pre-wrap text-ink">
          {request.inspector_comment || request.reason}
        </p>
        {request.photo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={request.photo_url}
            alt="検品写真"
            className="max-w-sm rounded-lg border border-line"
          />
        )}
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-[11.5px]">
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">サイズ</dt>
            <dd className="text-ink">{request.print_jobs?.nui_sizes?.label ?? "—"}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">実使用フィラメント</dt>
            <dd className="num text-ink">
              {request.print_jobs?.actual_weight_g != null
                ? `${request.print_jobs.actual_weight_g}g`
                : "—"}
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">実印刷時間</dt>
            <dd className="num text-ink">
              {request.print_jobs?.actual_print_min != null
                ? `${request.print_jobs.actual_print_min}分`
                : "—"}
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">再印刷の代行費</dt>
            <dd className="num text-danger">
              ¥{request.reprint_fee.toLocaleString()}（クリエイター負担）
            </dd>
          </div>
        </dl>
      </div>

      {/* STEP1 の検証値 */}
      <div className="flex flex-col gap-2 rounded-xl border border-line bg-white p-4">
        <p className="text-sm font-bold text-ink">STEP1 の自動検証値</p>
        {validation ? (
          <>
            <dl className="flex flex-wrap gap-x-6 gap-y-1 text-[11.5px]">
              <div className="flex gap-1.5">
                <dt className="text-muted-foreground">三角形</dt>
                <dd className="num text-ink">
                  {validation.triangle_count?.toLocaleString() ?? "—"}
                </dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-muted-foreground">造形サイズ</dt>
                <dd className="num text-ink">
                  {validation.bbox_w_mm != null
                    ? `${Number(validation.bbox_w_mm).toFixed(1)}×${Number(validation.bbox_d_mm).toFixed(1)}×${Number(validation.bbox_h_mm).toFixed(1)}mm`
                    : "—"}
                </dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-muted-foreground">分離パーツ</dt>
                <dd className="num text-ink">{validation.shell_count ?? "—"}</dd>
              </div>
            </dl>
            {flagged.length > 0 && (
              <ul className="flex flex-col gap-1 pt-1">
                {flagged.map((c) => (
                  <li key={c.key} className="text-[11.5px] leading-5">
                    <span className="font-semibold text-ink">{c.label}</span>
                    <span className="text-muted-foreground">：{c.detail}</span>
                    {c.howToFix && (
                      <span className="block text-muted-foreground">→ {c.howToFix}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="text-[12px] text-muted-foreground">
            この作品には自動検証の記録がありません。
          </p>
        )}
      </div>

      {/* 対応方法の3択 */}
      <div className="grid gap-3 sm:grid-cols-3">
        {CHOICES.map(({ icon: Icon, title, body, href, cta }) => (
          <Link
            key={title}
            href={href(productId)}
            className="flex flex-col gap-2 rounded-xl border border-line bg-white p-4 transition-colors hover:border-brand/40"
          >
            <Icon className="size-5 text-brand" aria-hidden />
            <span className="text-[13px] font-semibold text-ink">{title}</span>
            <span className="text-[11.5px] leading-5 text-muted-foreground">{body}</span>
            <span className="mt-auto pt-1 text-[11.5px] font-semibold text-brand">
              {cta} →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
