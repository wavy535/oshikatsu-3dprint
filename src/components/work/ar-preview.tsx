"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Box } from "lucide-react";

import { AR_DISPLAY } from "@/lib/ar/config";
import type { ArModelKind, ArModelOption, RoomUnavailableReason } from "@/lib/ar/options";
import type { QrUnavailableReason } from "@/lib/ar/preview";
import { ArModelViewer } from "./ar-model-viewer";
import { cn } from "@/lib/utils";

// 小数の誤差（125.50000000000001 など）を出さず、整数なら小数点も付けない
const mm = (value: number) => Number(value.toFixed(AR_DISPLAY.mmDecimals));

const LABEL: Record<ArModelKind, string> = {
  work: "この作品",
  "three-walls": "仮の部屋（3面）",
  "back-left": "仮の部屋（奥＋左）",
};

const ROOM_HINT: Record<RoomUnavailableReason, string> = {
  signed_out: "ログインしてマイぬいを登録すると、うちの子の寸法に合わせた仮の部屋も表示できます。",
  no_nui: "メインのマイぬいを登録すると、うちの子の寸法に合わせた仮の部屋も表示できます。",
  out_of_range: "マイぬいの採寸値が表示できる範囲の外なので、仮の部屋を表示できません。",
};

/** QR コードを出せない理由 */
const QR_HINT: Record<QrUnavailableReason, string> = {
  no_size: "選んだぬいのサイズに対応する展開がないため、QR コードを出せません。",
  no_model: "AR用の3Dデータが登録されていないため、QR コードを出せません。",
} as const;

type Props = {
  options: ArModelOption[];
  sizeLabel: string | null;
  interiorMm: { widthMm: number; depthMm: number; heightMm: number } | null;
  roomUnavailable: RoomUnavailableReason | null;
  signedIn: boolean;
  // 登録済みのマイぬい（プルダウン）と、選ばれているぬい
  nuis: { id: string; label: string }[];
  selectedNuiId: string | null;
  // 選び直すときのリンク（basePath?baseQuery&nui=...）
  basePath: string;
  baseQuery: string;
  // 選んだぬいのサイズの作品を AR で開く QR コード
  qr: { url: string; imageDataUrl: string } | null;
  qrUnavailable: QrUnavailableReason | null;
};

/**
 * 作品や仮の部屋を実寸で AR 表示する（AR-1：本物のぬいは横に並べて見る）。
 * model-viewer が端末に合わせて iPhone は Quick Look、Android は WebXR / Scene Viewer を選ぶ。
 * 3D表示の部品は重いので、「開く」を押したときに読み込む。
 */
export function ArPreview({
  options,
  sizeLabel,
  interiorMm,
  roomUnavailable,
  signedIn,
  nuis,
  selectedNuiId,
  basePath,
  baseQuery,
  qr,
  qrUnavailable,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ArModelKind | null>(options[0]?.kind ?? null);
  if (options.length === 0 && !roomUnavailable) return null;
  const selected = options.find((option) => option.kind === kind) ?? options[0] ?? null;

  return (
    <div className="flex min-h-28 flex-col gap-2 rounded-lg border border-line bg-ground/60 p-3">
      <div className="flex items-center gap-2">
        <p className="flex items-center gap-1.5 text-[12px] font-semibold text-ink">
          <Box className="size-3.5" aria-hidden />
          ARで実寸を見る
        </p>
        {selected && !open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="ml-auto min-h-11 px-2 text-[11.5px] font-semibold text-brand hover:underline"
          >
            開く
          </button>
        )}
      </div>

      {/* マイぬいを選ぶと、そのぬいに合うサイズで AR に出せる（スマホ用の QR コードもここに出す） */}
      {nuis.length > 0 && (
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
            マイぬい
            <select
              aria-label="マイぬい"
              value={selectedNuiId ?? ""}
              onChange={(event) => {
                const query = new URLSearchParams(baseQuery);
                if (event.target.value) query.set("nui", event.target.value);
                const suffix = query.toString();
                router.push(suffix ? `${basePath}?${suffix}` : basePath, { scroll: false });
              }}
              className="min-w-0 flex-1 rounded-md border border-line bg-white px-2 py-1 text-[12px] text-ink"
            >
              <option value="">選んでください</option>
              {nuis.map((nui) => (
                <option key={nui.id} value={nui.id}>
                  {nui.label}
                </option>
              ))}
            </select>
          </label>
          {selectedNuiId && qr && (
            <div className="flex flex-col items-start gap-3 rounded-lg border border-line bg-white p-2.5 sm:flex-row">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qr.imageDataUrl}
                alt="スマホのカメラで読み取ると、この作品の AR が起動します"
                className="size-[120px] shrink-0"
              />
              <p className="flex flex-col gap-1 text-[11px] leading-4 text-muted-foreground">
                <span>
                  スマホのカメラでこの QR コードを読み取ると、選んだぬいに合うサイズ
                  {sizeLabel && <span className="font-semibold text-ink">（{sizeLabel}）</span>}
                  のこの作品が、実寸で AR に出ます。
                </span>
                <a href={qr.url} className="font-semibold text-brand hover:underline">
                  スマホでこのページを見ている場合はここをタップ
                </a>
              </p>
            </div>
          )}
          {selectedNuiId && !qr && qrUnavailable && (
            <p className="text-[11px] leading-4 text-muted-foreground">{QR_HINT[qrUnavailable]}</p>
          )}
        </div>
      )}

      {open && selected && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {options.map((option) => (
              <button
                key={option.kind}
                type="button"
                aria-pressed={option.kind === selected.kind}
                onClick={() => {
                  setKind(option.kind);
                }}
                className={cn(
                  "min-h-11 rounded-full border px-2.5 py-1 text-[11px]",
                  option.kind === selected.kind
                    ? "border-brand bg-brand-soft font-semibold text-ink"
                    : "border-line bg-white text-muted-foreground hover:text-ink",
                )}
              >
                {option.kind === "work" && sizeLabel ? `${LABEL.work}（${sizeLabel}）` : LABEL[option.kind]}
              </button>
            ))}
          </div>

          <ArModelViewer key={selected.src} src={selected.src} label={LABEL[selected.kind]} />

          {selected.kind !== "work" && interiorMm && (
            <p className="text-[11px] leading-4 text-muted-foreground">
              部屋の内寸 <span className="num">{mm(interiorMm.widthMm)}</span> ×{" "}
              <span className="num">{mm(interiorMm.depthMm)}</span> ×{" "}
              <span className="num">{mm(interiorMm.heightMm)}</span> mm（幅×奥行×高さ）。
              ピンクの箱がマイぬいの大きさの目安です。
            </p>
          )}

          <ul className="list-disc space-y-0.5 pl-4 text-[10.5px] leading-4 text-muted-foreground">
            <li>実寸で表示され、拡大・縮小はできません。</li>
            <li>
              置く場所は決まっていません。iPhone を床に向けて床が認識されてから置き、そのあとは1本指で動かし、2本指で回して向きを変えられます。
            </li>
            {selected.kind !== "work" && (
              <li>
                部屋の基準点は奥の左下の角です。実際の部屋の角に合わせ、開いている面を自分のほうに向けると中が見えます。壁には自動では沿わないので、床に置いてから回して寄せてください。
              </li>
            )}
            <li>
              本物のぬいは、画面上で部屋と重ならない位置（横）に置いて撮影してください。部屋の手前に置くと、部屋がぬいの上に表示されます。
            </li>
            <li>実寸でも数cmずれることがあります。入るかどうかは相性判定をご確認ください。</li>
            <li>ARのボタンが出ないときは、iPhone は Safari、Android は Chrome で開いてください。</li>
            {selected.kind === "work" && (
              <li>作品は単色で表示します。AR用データに登録された配置で表示されます。</li>
            )}
          </ul>
        </>
      )}

      {roomUnavailable && (
        <p className="text-[11px] leading-4 text-muted-foreground">
          {ROOM_HINT[roomUnavailable]}{" "}
          <Link
            href={signedIn ? "/mypage/nuis" : "/login?redirect=/mypage/nuis"}
            className="font-semibold text-brand hover:underline"
          >
            {signedIn ? "マイぬいを確認する" : "ログインする"}
          </Link>
        </p>
      )}
    </div>
  );
}
