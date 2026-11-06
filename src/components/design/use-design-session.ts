"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { applyProposal, type Proposal } from "@/lib/design/ai-contract";
import { createDesignStore, type Design } from "@/lib/design/document";
import type { ExportFormat } from "@/lib/design/export";
import type { DesignBuild } from "@/lib/design/geometry";
import { createWorkerClient, Superseded } from "@/lib/design/worker-client";

export function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "操作を完了できませんでした。";
}

type BuiltDesign = { revision: number; design: Design; build: DesignBuild };
type BuildError = { revision: number; message: string };

/** Owns the design history and worker. Async edits may only commit to their source revision. */
export function useDesignSession() {
  const [store] = useState(createDesignStore);
  const state = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  const [built, setBuilt] = useState<BuiltDesign | null>(null);
  const [failure, setFailure] = useState<BuildError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const client = useRef<ReturnType<typeof createWorkerClient> | null>(null);
  const alive = useRef(false);

  useEffect(() => {
    alive.current = true;
    try {
      client.current = createWorkerClient();
    } catch (error) {
      const failure = {
        revision: store.getSnapshot().revision,
        message: errorMessage(error),
      };
      queueMicrotask(() => {
        if (alive.current) setFailure(failure);
      });
    }
    return () => {
      alive.current = false;
      client.current?.dispose();
      client.current = null;
    };
  }, [attempt, store]);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const response = await client.current?.request(state.design);
        if (active && response?.kind === "build") {
          setBuilt({
            revision: state.revision,
            design: state.design,
            build: response.build,
          });
          setFailure(null);
        }
      } catch (error) {
        if (active && !(error instanceof Superseded)) {
          setFailure({
            revision: state.revision,
            message: errorMessage(error),
          });
        }
      }
    }, 80);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [state.design, state.revision, attempt]);

  async function applyChat(
    proposal: Proposal,
    revision: number,
    signal: AbortSignal,
  ) {
    function assertCurrent() {
      signal.throwIfAborted();
      if (!alive.current || store.getSnapshot().revision !== revision) {
        throw new Error(
          "AIの応答中に設計が変わりました。現在の設計からもう一度送信してください。",
        );
      }
    }
    assertCurrent();
    const { design } = applyProposal(store.getSnapshot().design, proposal);
    if (!proposal.changes.length) return;
    if (!client.current)
      throw new Error(
        "制作エンジンの準備ができていません。再試行してください。",
      );

    const result = await client.current.request(design);
    assertCurrent();
    if (
      result.kind !== "build" ||
      result.build.issues.some((issue) => issue.level === "error")
    ) {
      throw new Error(
        "形状の検査に通らなかったため変更していません。寸法を調整して再送してください。",
      );
    }
    store.replace(design);
  }

  async function exportSnapshot(design: Design, format: ExportFormat) {
    if (!client.current)
      throw new Error(
        "制作エンジンの準備ができていません。再試行してください。",
      );
    const result = await client.current.request(design, format);
    if (result.kind !== "export")
      throw new Error("データを書き出せませんでした。");
    return result.bytes;
  }

  return {
    design: state.design,
    revision: state.revision,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    built,
    pending: built?.revision !== state.revision,
    buildError: failure?.revision === state.revision ? failure.message : "",
    snapshot: store.getSnapshot,
    replace: store.replace,
    undo: store.undo,
    redo: store.redo,
    applyChat,
    exportSnapshot,
    retry() {
      setFailure(null);
      setAttempt((value) => value + 1);
    },
  };
}

export type DesignSession = ReturnType<typeof useDesignSession>;
