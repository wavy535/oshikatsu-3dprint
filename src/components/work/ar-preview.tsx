"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Box } from "lucide-react";

import { AR_DISPLAY } from "@/lib/ar/config";
import type { ArModelKind, ArModelOption, RoomUnavailableReason } from "@/lib/ar/options";
import { Button } from "@/components/ui/button";
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

type Props = {
  options: ArModelOption[];
  sizeLabel: string | null;
  interiorMm: { widthMm: number; depthMm: number; heightMm: number } | null;
  roomUnavailable: RoomUnavailableReason | null;
  signedIn: boolean;
};

/**
 * 作品や仮の部屋を実寸で AR 表示する（AR-1：本物のぬいは横に並べて見る）。
 * model-viewer が端末に合わせて iPhone は Quick Look、Android は WebXR / Scene Viewer を選ぶ。
 * 3D表示の部品は重いので、「開く」を押したときに読み込む。
 */
export function ArPreview({ options, sizeLabel, interiorMm, roomUnavailable, signedIn }: Props) {
  const [open, setOpen] = useState(false);
  const [viewerReady, setViewerReady] = useState(false);
  const [viewerFailed, setViewerFailed] = useState(false);
  const [kind, setKind] = useState<ArModelKind | null>(options[0]?.kind ?? null);
  const [modelFailed, setModelFailed] = useState(false);
  const [viewer, setViewer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!open || viewerReady) return;
    let active = true;
    import("@google/model-viewer").then(
      () => {
        if (active) setViewerReady(true);
      },
      () => {
        if (active) setViewerFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [open, viewerReady]);

  useEffect(() => {
    if (!viewer) return;
    const onError = () => setModelFailed(true);
    const onLoad = () => setModelFailed(false);
    viewer.addEventListener("error", onError);
    viewer.addEventListener("load", onLoad);
    return () => {
      viewer.removeEventListener("error", onError);
      viewer.removeEventListener("load", onLoad);
    };
  }, [viewer]);

  if (options.length === 0 && !roomUnavailable) return null;
  const selected = options.find((option) => option.kind === kind) ?? options[0] ?? null;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-ground/60 p-3">
      <div className="flex items-center gap-2">
        <p className="flex items-center gap-1.5 text-[12px] font-semibold text-ink">
          <Box className="size-3.5" aria-hidden />
          ARで実寸を見る
        </p>
        {selected && !open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="ml-auto text-[11.5px] font-semibold text-brand hover:underline"
          >
            開く
          </button>
        )}
      </div>

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
                  setModelFailed(false);
                }}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px]",
                  option.kind === selected.kind
                    ? "border-brand bg-brand-soft font-semibold text-ink"
                    : "border-line bg-white text-muted-foreground hover:text-ink",
                )}
              >
                {option.kind === "work" && sizeLabel ? `${LABEL.work}（${sizeLabel}）` : LABEL[option.kind]}
              </button>
            ))}
          </div>

          {viewerFailed ? (
            <p className="text-[11.5px] text-danger">3D表示を読み込めませんでした。時間をおいて開き直してください。</p>
          ) : viewerReady ? (
            <model-viewer
              ref={setViewer}
              src={selected.src}
              alt={LABEL[selected.kind]}
              ar
              ar-modes="webxr scene-viewer quick-look"
              ar-scale="fixed"
              ar-placement="floor"
              camera-controls
              touch-action="pan-y"
              shadow-intensity="1"
              className="relative block h-64 w-full rounded-md bg-white"
            >
              <Button slot="ar-button" size="sm" className="absolute right-2 bottom-2">
                ARで置いてみる
              </Button>
            </model-viewer>
          ) : (
            <p className="text-[11.5px] text-muted-foreground">3D表示を準備しています…</p>
          )}

          {modelFailed && (
            <p className="text-[11.5px] text-danger">このモデルを表示できませんでした。</p>
          )}

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
              本物のぬいは、画面上で部屋と重ならない位置（横）に置いて撮影してください。部屋の手前に置くと、部屋がぬいの上に表示されます。
            </li>
            <li>実寸でも数cmずれることがあります。入るかどうかは相性判定をご確認ください。</li>
            <li>ARのボタンが出ないときは、iPhone は Safari、Android は Chrome で開いてください。</li>
            {selected.kind === "work" && (
              <li>作品は単色で表示します。複数パーツの作品は、印刷用に並べた配置のまま表示されます。</li>
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
