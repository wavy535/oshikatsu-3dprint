"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { designParts, type PartId } from "@/lib/design/parts";
import { cn } from "@/lib/utils";
import { useHydrated } from "@/lib/use-hydrated";
import { DesignChat } from "./design-chat";
import { DesignCompletion } from "./design-completion";
import { DesignFileControls } from "./design-file-controls";
import { DesignPreview } from "./design-preview";
import { EditorToolbar } from "./editor-toolbar";
import { ManualControls } from "./manual-controls";
import { useDesignFiles } from "./use-design-files";
import { useDesignSession } from "./use-design-session";

const PANELS = [
  { id: "ai", label: "AIで編集" },
  { id: "manual", label: "手動で調整" },
  { id: "finish", label: "完成・AR" },
] as const;
type Panel = (typeof PANELS)[number]["id"];

export function HouseEditor() {
  const hydrated = useHydrated();
  const session = useDesignSession();
  const files = useDesignFiles(session);
  const [panel, setPanel] = useState<Panel>("ai");
  const [selected, setSelected] = useState<PartId>("back");
  const parts = designParts(session.design);
  const selectedPart = parts.find((part) => part.id === selected) ?? parts[0];

  function continueEditing() {
    files.closeAr();
    setPanel("ai");
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-ground"
      data-testid="design-workspace"
    >
      <EditorToolbar
        name={session.design.name}
        canUndo={session.canUndo}
        canRedo={session.canRedo}
        onUndo={session.undo}
        onRedo={session.redo}
        onSave={files.saveLocal}
        onFinish={() => setPanel("finish")}
      />
      {files.error && (
        <p
          role="alert"
          className="shrink-0 border-b border-danger bg-white px-4 py-2 text-sm text-danger"
        >
          {files.error}
        </p>
      )}
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(180px,40%)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_400px] lg:grid-rows-1">
        <DesignPreview
          session={session}
          ar={panel === "finish" ? files.ar : null}
          selectedId={selectedPart?.id ?? "back"}
          selectedLabel={selectedPart?.label}
          onSelect={setSelected}
          onCloseAr={files.closeAr}
        />
        <aside
          aria-label="制作の操作"
          className="flex min-h-0 min-w-0 flex-col bg-white pb-[env(safe-area-inset-bottom)]"
        >
          <div
            className="grid shrink-0 grid-cols-3 border-b border-line"
            aria-label="制作メニュー"
          >
            {PANELS.map(({ id, label }) => (
              <Button
                key={id}
                variant="ghost"
                size="sm"
                aria-pressed={panel === id}
                disabled={!hydrated}
                className={cn(
                  "rounded-none border-b-2 px-1 text-sm",
                  panel === id
                    ? "border-brand bg-brand-soft text-brand"
                    : "border-transparent text-muted-foreground",
                )}
                onClick={() => setPanel(id)}
              >
                {label}
              </Button>
            ))}
          </div>
          {/* Keep the conversation mounted while editing manually or reviewing the result. */}
          <div className={cn("min-h-0 flex-1", panel !== "ai" && "hidden")}>
            <DesignChat
              snapshot={session.snapshot}
              selected={selectedPart?.id ?? "back"}
              selectedLabel={selectedPart?.label}
              apply={session.applyChat}
            />
          </div>
          <div
            className={cn(
              "min-h-0 flex-1 overflow-y-auto overscroll-contain p-4",
              panel !== "manual" && "hidden",
            )}
          >
            <div className="mb-5" aria-label="部品一覧">
              <p className="mb-2 text-sm font-semibold">編集する部品</p>
              <div className="flex flex-wrap gap-2">
                {parts.map((part) => (
                  <Button
                    key={part.id}
                    size="sm"
                    variant="outline"
                    aria-pressed={selectedPart?.id === part.id}
                    onClick={() => setSelected(part.id)}
                    className={cn(
                      "px-3",
                      selectedPart?.id === part.id && "border-brand text-brand",
                    )}
                  >
                    {part.label}
                  </Button>
                ))}
              </div>
            </div>
            <ManualControls design={session.design} update={files.update} />
            <DesignFileControls files={files} />
          </div>
          <div
            className={cn(
              "min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5",
              panel !== "finish" && "hidden",
            )}
          >
            <DesignCompletion
              session={session}
              files={files}
              onContinue={continueEditing}
            />
          </div>
          <p
            role="status"
            className="shrink-0 border-t border-line px-3 py-1 text-sm text-muted-foreground"
          >
            {files.exporting ? "データを準備しています…" : files.notice}
          </p>
        </aside>
      </div>
    </div>
  );
}
