"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function DesignAr({ glb, usdz }: { glb: string; usdz: string }) {
  const [ready, setReady] = useState(false), [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    import("@google/model-viewer").then(() => { if (active) setReady(true); }, () => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);
  return <div className="border-t border-line pt-4">
    <p className="mb-3 text-sm text-muted-foreground">対応するスマホで実寸表示できます。設置誤差があるため、最後は定規でも確認してください。</p>
    {failed ? <p role="alert">AR表示を読み込めませんでした。閉じて再試行してください。</p> : !ready ? <p role="status">AR表示を準備しています…</p> :
      <model-viewer src={glb} ios-src={usdz} alt="制作中のおうち" ar ar-modes="webxr quick-look" ar-scale="fixed" camera-controls touch-action="pan-y" className="block h-72 w-full bg-ground">
        <Button slot="ar-button" className="absolute right-3 bottom-3">ARで置いてみる</Button>
      </model-viewer>}
    <p className="mt-3 text-sm text-muted-foreground">この端末で作ったデータを使います。AR非対応の端末では3D表示のみ利用できます。</p>
  </div>;
}
