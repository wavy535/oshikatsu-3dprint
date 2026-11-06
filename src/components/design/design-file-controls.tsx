"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import type { DesignFiles } from "./use-design-files";

export function DesignFileControls({ files }: { files: DesignFiles }) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <details className="mt-5 border-t border-line">
      <summary className="min-h-11 cursor-pointer py-3 font-semibold">
        設計を開く・ファイルに保存
      </summary>
      <div className="flex flex-col items-start gap-2 pb-4">
        <Button variant="outline" size="sm" onClick={files.restoreLocal}>
          保存した設計を開く
        </Button>
        <Button variant="outline" size="sm" onClick={files.saveJson}>
          設計ファイルを保存
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => input.current?.click()}
        >
          設計ファイルを開く
        </Button>
        <input
          ref={input}
          type="file"
          accept=".json"
          aria-label="設計ファイル"
          className="sr-only"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) void files.importFile(file);
          }}
        />
      </div>
    </details>
  );
}
