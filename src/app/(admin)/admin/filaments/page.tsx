import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { listFilamentLedger, listFilamentStock } from "@/lib/ops/inventory-queries";
import { LEDGER_REASON_LABEL, LOW_STOCK_GRAMS, shortDateTime } from "@/lib/ops/labels";
import { NewFilamentForm, StockAdjustForm, ToggleActiveButton } from "@/components/ops/filament-forms";
import { Pill } from "@/components/ops/status-badge";
import { Card, StatCard, TD, TH } from "@/components/ops/stat-card";

export const metadata = { title: "フィラメント在庫" };

const kg = (g: number) => `${(g / 1000).toFixed(g >= 1000 ? 1 : 2)} kg`;

/**
 * フィラメント在庫。在庫は台帳（filament_ledger）の結果で、ここでは数字を
 * 直接書かない。補充・廃棄も台帳に積む。
 */
export default async function AdminFilamentsPage() {
  const [stock, ledger] = await Promise.all([listFilamentStock(), listFilamentLedger()]);

  const active = stock.filter((f) => f.is_active);
  const low = active.filter((f) => f.stock_grams < LOW_STOCK_GRAMS);
  const short = active.filter((f) => f.stock_grams - f.plannedGrams < 0);
  const totalGrams = active.reduce((n, f) => n + f.stock_grams, 0);
  const used30 = stock.reduce((n, f) => n + f.used30Grams, 0);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="在庫合計" value={kg(totalGrams)} note={`有効 ${active.length}種`} />
        <StatCard label="30日の消費" tone="info" value={kg(used30)} note="印刷で使ったぶん" />
        <StatCard
          label="残りわずか"
          tone={low.length > 0 ? "warn" : "neutral"}
          value={low.length}
          note={`${LOW_STOCK_GRAMS}g 未満`}
        />
        <StatCard
          label="不足の見込み"
          tone={short.length > 0 ? "danger" : "neutral"}
          value={short.length}
          note="作業中ジョブの推定消費が在庫を超える"
        />
      </div>

      {short.length > 0 && (
        <div className="flex items-center gap-2 rounded-xl bg-danger-bg px-3 py-2.5">
          <AlertTriangle className="size-3.5 text-danger" aria-hidden />
          <p className="text-[11px] text-danger">
            {short.map((f) => `${f.material}・${f.color_name}`).join("、")}
            は、作業中のジョブを刷り切るには在庫が足りません。先に補充してください。
          </p>
        </div>
      )}

      <div className="flex flex-col gap-4 xl:flex-row">
        <div className="min-w-0 flex-1 overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full min-w-[720px] border-collapse text-[11px]">
            <thead>
              <tr className="bg-ground text-[10.5px] text-muted-foreground">
                <th className={TH}>素材・色</th>
                <th className={`${TH} text-right`}>在庫</th>
                <th className={`${TH} text-right`}>予定消費</th>
                <th className={`${TH} text-right`}>差し引き</th>
                <th className={`${TH} text-right`}>30日の消費</th>
                <th className={`${TH} text-right`}>単価</th>
                <th className={`${TH} text-right`}>使用作品</th>
                <th className={TH}>状態</th>
                <th className={TH}></th>
              </tr>
            </thead>
            <tbody>
              {stock.map((f) => {
                const remain = f.stock_grams - f.plannedGrams;
                return (
                  <tr key={f.id} className={`border-t border-line ${f.is_active ? "" : "opacity-60"}`}>
                    <td className={`${TD} text-ink`}>
                      <span className="flex items-center gap-2">
                        <span
                          className="size-3.5 flex-none rounded-full border border-line"
                          style={{ background: f.color_hex }}
                        />
                        <span className="font-semibold">{f.material}</span>
                        <span>{f.color_name}</span>
                      </span>
                    </td>
                    <td className={`${TD} num text-right font-semibold text-ink`}>{f.stock_grams.toLocaleString("ja-JP")} g</td>
                    <td className={`${TD} num text-right text-muted-foreground`}>
                      {f.plannedGrams > 0 ? `−${Math.round(f.plannedGrams).toLocaleString("ja-JP")} g` : "—"}
                    </td>
                    <td className={`${TD} num text-right ${remain < 0 ? "font-semibold text-danger" : "text-ink"}`}>
                      {Math.round(remain).toLocaleString("ja-JP")} g
                    </td>
                    <td className={`${TD} num text-right text-ink`}>
                      {f.used30Grams > 0 ? `${Math.round(f.used30Grams).toLocaleString("ja-JP")} g` : "—"}
                    </td>
                    <td className={`${TD} num text-right text-ink`}>¥{Number(f.price_per_gram).toFixed(2)}</td>
                    <td className={`${TD} num text-right text-ink`}>{f.workCount}</td>
                    <td className={TD}>
                      {!f.is_active ? (
                        <Pill>停止中</Pill>
                      ) : f.stock_grams === 0 ? (
                        <Pill tone="danger">在庫なし</Pill>
                      ) : f.stock_grams < LOW_STOCK_GRAMS ? (
                        <Pill tone="warn">残りわずか</Pill>
                      ) : (
                        <Pill tone="ok">十分</Pill>
                      )}
                    </td>
                    <td className={`${TD} text-right`}>
                      <ToggleActiveButton filamentId={f.id} isActive={f.is_active} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex w-full flex-col gap-3 xl:w-80 xl:flex-none">
          <Card title="在庫の増減を記録">
            <StockAdjustForm filaments={stock} />
          </Card>
          <Card title="新しいフィラメント">
            <NewFilamentForm />
          </Card>
        </div>
      </div>

      <Card title="台帳（直近30件）">
        {ledger.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">まだ記録がありません。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-[11px]">
              <tbody>
                {ledger.map((l) => (
                  <tr key={l.id} className="border-b border-line last:border-b-0">
                    <td className={`${TD} num w-[96px] text-muted-foreground`}>{shortDateTime(l.created_at)}</td>
                    <td className={`${TD} text-ink`}>
                      <span className="flex items-center gap-2">
                        <span
                          className="size-2.5 flex-none rounded-full border border-line"
                          style={{ background: l.filaments?.color_hex ?? "transparent" }}
                        />
                        {l.filaments ? `${l.filaments.material}・${l.filaments.color_name}` : "—"}
                      </span>
                    </td>
                    <td className={`${TD} text-ink`}>{LEDGER_REASON_LABEL[l.reason] ?? l.reason}</td>
                    <td className={`${TD} num text-ink`}>
                      {l.print_jobs ? (
                        <Link href={`/admin/print-queue/${l.print_jobs.id}`} className="text-brand hover:underline">
                          {l.print_jobs.job_no}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className={`${TD} text-muted-foreground`}>{l.profiles?.display_name ?? "—"}</td>
                    <td className={`${TD} num text-right font-semibold ${Number(l.delta_grams) < 0 ? "text-danger" : "text-ok"}`}>
                      {Number(l.delta_grams) > 0 ? "+" : ""}
                      {Number(l.delta_grams).toLocaleString("ja-JP")} g
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
