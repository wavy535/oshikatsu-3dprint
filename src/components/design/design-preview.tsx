"use client";

import { lazy, Suspense, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DesignAr } from "./design-ar";
import type { DesignSession } from "./use-design-session";
import type { DesignFiles } from "./use-design-files";
import type { PartId } from "@/lib/design/parts";

const Viewport = lazy(() => import("./viewport"));

type Props = {
  session: DesignSession;
  ar: DesignFiles["ar"];
  selectedId: PartId;
  selectedLabel?: string;
  onSelect: (id: PartId) => void;
  onCloseAr: () => void;
};

export function DesignPreview({
  session,
  ar,
  selectedId,
  selectedLabel,
  onSelect,
  onCloseAr,
}: Props) {
  const [view, setView] = useState(0);
  const { design, built, pending, buildError, retry } = session;
  const heading = ar
    ? "ARで置いてみる"
    : selectedLabel
      ? `${selectedLabel}を選択中`
      : "制作中のモデル";
  const status = buildError
    ? "形状の生成が停止しました"
    : pending
      ? "形状を更新しています…"
      : "プレビューを更新しました";

  return (
    <section
      aria-label="プレビューと出力"
      className="relative flex min-h-0 min-w-0 flex-col overflow-hidden border-b border-line lg:border-r lg:border-b-0"
      aria-busy={pending && !buildError}
    >
      <div className="absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 p-2 sm:p-4">
        <div className="min-w-0 bg-white/95 px-3 py-2">
          <h2 className="truncate text-sm font-semibold">{heading}</h2>
          <p className="hidden text-sm text-muted-foreground sm:block">
            {ar ? "スマホで実寸を確認" : "部品をタップして、AIで編集"}
          </p>
        </div>
        {ar ? (
          <Button size="sm" variant="outline" onClick={onCloseAr}>
            3Dに戻る
          </Button>
        ) : (
          <Button
            size="icon"
            variant="outline"
            aria-label="視点を戻す"
            title="視点を戻す"
            onClick={() => setView((value) => value + 1)}
          >
            <RotateCcw className="size-4" aria-hidden />
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1">
        {ar ? (
          <DesignAr glb={ar.glb} usdz={ar.usdz} />
        ) : built ? (
          <Suspense
            fallback={
              <div className="h-full bg-ground" aria-label="3D表示を準備中" />
            }
          >
            <Viewport
              build={built.build}
              design={built.design}
              selected={selectedId}
              view={view}
              onSelect={onSelect}
            />
          </Suspense>
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-sm text-muted-foreground">
            制作エンジンを準備しています…
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 border-t border-line bg-white px-3 py-1 text-sm sm:px-5">
        <p role="status" data-testid="design-status">
          {status}
        </p>
        {design.scene === "house" && (
          <p className="tabular-nums text-muted-foreground">
            {design.house.width} × {design.house.depth} × {design.house.height}{" "}
            mm
            <span className="sr-only">（幅・奥行き・壁の高さ）</span>
          </p>
        )}
      </div>
      {buildError && (
        <div
          role="alert"
          className="absolute inset-x-3 bottom-12 z-20 border border-danger bg-white p-3"
        >
          <p className="text-sm text-danger">{buildError}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={retry}>
            再試行
          </Button>
        </div>
      )}
    </section>
  );
}
