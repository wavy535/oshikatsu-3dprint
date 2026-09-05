"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function StlDownloadButton({ assetId, fileName }: { assetId: string; fileName: string }) {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    try {
      const res = await fetch(`/api/admin/stl/${assetId}`);
      const data = await res.json();
      if (!res.ok || !data.url) {
        toast.error("ダウンロードURLの発行に失敗しました");
        return;
      }
      window.open(data.url, "_blank", "noopener,noreferrer");
    } finally {
      setPending(false);
    }
  }

  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={handleClick}>
      {pending ? "発行中..." : `DL: ${fileName}`}
    </Button>
  );
}
