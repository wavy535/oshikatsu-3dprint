"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/** Mounted only after opening AR. A source change remounts this component and clears stale errors. */
export function ArModelViewer({ src, label }: { src: string; label: string }) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [modelFailed, setModelFailed] = useState(false);
  const [viewer, setViewer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let active = true;
    import("@google/model-viewer").then(
      () => { if (active) setReady(true); },
      () => { if (active) setFailed(true); },
    );
    return () => { active = false; };
  }, [attempt]);

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

  return (
    <div className="flex flex-col gap-2">
      {/* Reserve the viewer's space while the library loads, avoiding a 256px jump. */}
      <div className="relative h-64 w-full rounded-md bg-white">
        {failed ? (
          <div role="alert" className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
            <p className="text-[11.5px] text-danger">3D表示を読み込めませんでした。</p>
            <Button variant="outline" size="sm" onClick={() => { setFailed(false); setAttempt((value) => value + 1); }}>
              再試行
            </Button>
          </div>
        ) : ready ? (
          <model-viewer
            ref={setViewer}
            src={src}
            alt={label}
            ar
            ar-modes="webxr scene-viewer quick-look"
            ar-scale="fixed"
            ar-placement="floor"
            camera-controls
            touch-action="pan-y"
            shadow-intensity="1"
            className="relative block size-full"
          >
            <Button slot="ar-button" size="sm" className="absolute right-2 bottom-2">
              ARで置いてみる
            </Button>
          </model-viewer>
        ) : (
          <div role="status" className="flex h-full flex-col justify-center gap-3 p-4">
            <div aria-hidden className="mx-auto size-16 rounded bg-ground" />
            <p className="text-center text-[11.5px] text-muted-foreground">3D表示を準備しています…</p>
          </div>
        )}
      </div>
      {modelFailed && <p role="alert" className="text-[11.5px] text-danger">このモデルを表示できませんでした。</p>}
    </div>
  );
}
