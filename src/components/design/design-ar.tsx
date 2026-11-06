"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function DesignAr({ glb, usdz }: { glb: string; usdz: string }) {
  const [ready, setReady] = useState(false),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    import("@google/model-viewer").then(
      () => {
        if (active) setReady(true);
      },
      () => {
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, []);
  return (
    <div className="flex h-full min-h-0 flex-col">
      {failed ? (
        <p role="alert">
          AR表示を読み込めませんでした。閉じて再試行してください。
        </p>
      ) : !ready ? (
        <p role="status">AR表示を準備しています…</p>
      ) : (
        <model-viewer
          src={glb}
          ios-src={usdz}
          alt="制作中の作品"
          ar
          ar-modes="webxr quick-look"
          ar-scale="fixed"
          camera-controls
          touch-action="pan-y"
          className="block min-h-0 w-full flex-1 bg-ground"
        >
          <Button slot="ar-button" className="absolute right-3 bottom-3">
            ARで置いてみる
          </Button>
        </model-viewer>
      )}
    </div>
  );
}
