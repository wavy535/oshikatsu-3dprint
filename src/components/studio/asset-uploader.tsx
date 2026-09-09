"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";

import { uploadFile } from "@/lib/files/upload";
import {
  registerAssetAction,
  type StepActionState,
} from "@/lib/works/step-actions";
import { Button } from "@/components/ui/button";
import { checkModelFileSize } from "@/lib/print/limits";

const initialState: StepActionState = { error: null };

/**
 * STEP1 のアップロード。
 *
 * Server Action が所有者とサイズを確認して発行した署名付きPOSTで、
 * ブラウザからS3へ直接送る。完了後にServer Actionで登録・解析する。
 */
export function AssetUploader({
  workId,
  hasAsset,
}: {
  workId: string;
  hasAsset: boolean;
}) {
  const router = useRouter();
  const [state, formAction, registering] = useActionState(
    async (previous: StepActionState, data: FormData) => {
      const next = await registerAssetAction(previous, data);
      router.refresh();
      return next;
    },
    initialState,
  );
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onPick(file: File) {
    if (uploading || registering) return;
    setUploadError(null);
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "stl" && ext !== "3mf") {
      setUploadError("STL または 3MF のファイルを選んでください");
      return;
    }
    try {
      checkModelFileSize(file.size);
    } catch (error) {
      setUploadError((error as Error).message);
      return;
    }

    setUploading(true);
    let path: string;
    try {
      path = await uploadFile("work-stl", file, workId);
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : "アップロードに失敗しました",
      );
      return;
    } finally {
      setUploading(false);
    }

    // 隠しフォームを submit する形だと、hidden の値が反映される前に
    // 送信されてしまうことがある（実際に登録されず素通りした）。
    // FormData を自分で組んで Server Action へ直接渡す。
    const fd = new FormData();
    fd.set("workId", workId);
    fd.set("storagePath", path);
    fd.set("fileName", file.name);
    fd.set("fileSize", String(file.size));
    startTransition(() => {
      formAction(fd);
      // 検証結果はサーバー側で書かれるので、完了後に読み直す
    });
  }

  const busy = uploading || registering;

  return (
    <div className="flex flex-col gap-3">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files?.[0];
          if (file) void onPick(file);
        }}
        className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line bg-white px-6 py-10 text-center"
      >
        <Upload className="size-6 text-line" aria-hidden />
        <p className="text-[13px] font-semibold text-ink">
          {hasAsset ? "3Dデータを差し替える" : "3Dデータをアップロード"}
        </p>
        <p className="text-[11.5px] leading-4 text-muted-foreground">
          STL または
          3MF（80MiB・50万面・128パーツまで）。アップロードすると、閉じたメッシュ・肉厚・造形サイズなどを
          自動で検証します。
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".stl,.3mf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onPick(file);
          }}
        />
        <Button
          type="button"
          size="sm"
          className="mt-1"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {uploading
            ? "アップロード中..."
            : registering
              ? "検証しています..."
              : "ファイルを選ぶ"}
        </Button>
      </div>

      {(uploadError || state.error) && (
        <p className="text-[12px] text-danger">{uploadError ?? state.error}</p>
      )}
    </div>
  );
}
