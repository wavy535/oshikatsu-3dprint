"use client";

import { MoveUpRight, Redo2, Save, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHydrated } from "@/lib/use-hydrated";

type Props = {
  name: string;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onFinish: () => void;
};

export function EditorToolbar({
  name,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSave,
  onFinish,
}: Props) {
  const hydrated = useHydrated();
  return (
    <div
      className="flex shrink-0 items-center justify-between gap-2 border-b border-line bg-white px-3 py-2 sm:px-5"
      aria-label="設計の保存と履歴"
    >
      <div className="min-w-0">
        <h1 className="text-balance text-lg font-bold sm:text-xl">
          AIでつくる
        </h1>
        <p className="hidden truncate text-sm text-muted-foreground sm:block">
          {name}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="取り消し"
          title="取り消し"
          disabled={!canUndo}
          onClick={onUndo}
        >
          <Undo2 className="size-5" aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="やり直し"
          title="やり直し"
          disabled={!canRedo}
          onClick={onRedo}
        >
          <Redo2 className="size-5" aria-hidden />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="この端末に保存"
          className="hidden sm:inline-flex"
          title="この端末に保存"
          onClick={onSave}
          disabled={!hydrated}
        >
          <Save className="size-5" aria-hidden />
        </Button>
        <Button
          size="sm"
          className="px-3 text-base"
          onClick={onFinish}
          disabled={!hydrated}
        >
          完成・ARへ
          <MoveUpRight className="hidden size-4 sm:block" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
