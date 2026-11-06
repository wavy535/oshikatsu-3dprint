"use client";

import { useEffect, useRef, useState } from "react";
import {
  DESIGN_FILE_LIMIT,
  readDesign,
  type Design,
} from "@/lib/design/document";
import type { ExportFormat } from "@/lib/design/export";
import { Superseded } from "@/lib/design/worker-client";
import { errorMessage, type DesignSession } from "./use-design-session";

const STORAGE_KEY = "oshinest.design.v1";
type ArFiles = { revision: number; glb: string; usdz: string };
type Notice = { revision: number; text: string };

function download(bytes: Uint8Array | string, filename: string, type: string) {
  const data = typeof bytes === "string" ? bytes : new Uint8Array(bytes);
  const url = URL.createObjectURL(new Blob([data], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

const EXPORT_FILES: Record<ExportFormat, { filename: string; type: string }> = {
  "3mf": { filename: "oshinest-parts.zip", type: "application/zip" },
  glb: { filename: "oshinest-house.glb", type: "model/gltf-binary" },
  usdz: { filename: "oshinest-house.usdz", type: "model/vnd.usdz+zip" },
};

/** Storage and generated URLs stay separate from design history and rendering. */
export function useDesignFiles(session: DesignSession) {
  const [failure, setFailure] = useState<Notice | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [exporting, setExporting] = useState(false);
  const [ar, setAr] = useState<ArFiles | null>(null);
  const exportingRef = useRef(false);
  const alive = useRef(false);

  function setError(text: string) {
    setFailure(text ? { revision: session.snapshot().revision, text } : null);
  }

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(
    () => () => {
      if (ar) {
        URL.revokeObjectURL(ar.glb);
        URL.revokeObjectURL(ar.usdz);
      }
    },
    [ar],
  );

  function notify(text: string) {
    setNotice({ revision: session.snapshot().revision, text });
    setError("");
  }

  function replace(design: Design) {
    try {
      session.replace(design);
      setError("");
      return true;
    } catch (error) {
      setError(errorMessage(error));
      return false;
    }
  }

  function saveLocal() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(session.snapshot().design),
      );
      notify("この端末に保存しました。");
    } catch {
      setError("この端末に保存できません。設計ファイルを保存してください。");
    }
  }

  function restoreLocal() {
    try {
      const text = localStorage.getItem(STORAGE_KEY);
      if (!text) throw new Error("この端末には保存した設計がありません。");
      session.replace(readDesign(text));
      notify("保存した設計を開きました。");
    } catch (error) {
      setError(errorMessage(error));
    }
  }

  async function importFile(file: File) {
    const revision = session.snapshot().revision;
    try {
      if (file.size > DESIGN_FILE_LIMIT)
        throw new Error("設計ファイルは128KiBまでです。");
      const design = readDesign(await file.text());
      if (!alive.current) return;
      if (session.snapshot().revision !== revision) {
        throw new Error(
          "読み込み中に編集されました。ファイルをもう一度開いてください。",
        );
      }
      session.replace(design);
      notify("設計ファイルを開きました。");
    } catch (error) {
      if (alive.current) setError(errorMessage(error));
    }
  }

  function saveJson() {
    download(
      JSON.stringify(session.snapshot().design, null, 2),
      "house.oshinest.json",
      "application/json",
    );
    notify("設計ファイルを保存しました。");
  }

  async function exportFile(format: ExportFormat | "ar") {
    if (exportingRef.current) return;
    const snapshot = session.snapshot();
    exportingRef.current = true;
    setExporting(true);
    setError("");
    try {
      if (format === "ar") {
        const glb = await session.exportSnapshot(snapshot.design, "glb");
        const usdz = await session.exportSnapshot(snapshot.design, "usdz");
        if (!alive.current) return;
        if (session.snapshot().revision !== snapshot.revision) {
          throw new Error("設計が変わりました。もう一度ARを開いてください。");
        }
        setAr({
          revision: snapshot.revision,
          glb: URL.createObjectURL(
            new Blob([new Uint8Array(glb)], { type: EXPORT_FILES.glb.type }),
          ),
          usdz: URL.createObjectURL(
            new Blob([new Uint8Array(usdz)], { type: EXPORT_FILES.usdz.type }),
          ),
        });
      } else {
        const bytes = await session.exportSnapshot(snapshot.design, format);
        if (!alive.current) return;
        const { filename, type } = EXPORT_FILES[format];
        download(bytes, filename, type);
        notify("書き出しました。出力ボタンを押した時点の設計です。");
      }
    } catch (error) {
      if (alive.current && !(error instanceof Superseded))
        setError(errorMessage(error));
    } finally {
      exportingRef.current = false;
      if (alive.current) setExporting(false);
    }
  }

  return {
    error: failure?.revision === session.revision ? failure.text : "",
    notice:
      notice?.revision === session.revision
        ? notice.text
        : session.revision > 0
          ? "未保存の変更があります"
          : "手動編集は登録なしで使えます",
    exporting,
    ar: ar?.revision === session.revision ? ar : null,
    update: replace,
    saveLocal,
    restoreLocal,
    importFile,
    saveJson,
    exportFile,
    closeAr() {
      setAr(null);
    },
  };
}

export type DesignFiles = ReturnType<typeof useDesignFiles>;
