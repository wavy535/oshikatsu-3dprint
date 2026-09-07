"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { registerAssetAction, type StepActionState } from "@/lib/works/step-actions";
import { Button } from "@/components/ui/button";

const initialState: StepActionState = { error: null };

/**
 * STEP1 のアップロード。
 *
 * ファイル本体はブラウザから Storage へ直接上げる（Server Action の本文サイズ制限に
 * 3Dデータが収まらないため）。パスは storage のポリシーに合わせて
 * `{ユーザーID}/{作品ID}/{ファイル名}`。アップロードが終わってから
 * Server Action に登録と検証を任せる。
 */
export function AssetUploader({
  workId,
  userId,
  hasAsset,
}: {
  workId: string;
  userId: string;
  hasAsset: boolean;
}) {
  const [state, formAction, registering] = useActionState(registerAssetAction, initialState);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function onPick(file: File) {
    setUploadError(null);
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "stl" && ext !== "3mf") {
      setUploadError("STL または 3MF のファイルを選んでください");
      return;
    }
    if (file.size > 80 * 1024 * 1024) {
      setUploadError("ファイルが大きすぎます（80MBまで）");
      return;
    }

    setUploading(true);
    const supabase = createClient();
    const path = `${userId}/${workId}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("work-stl").upload(path, file, { upsert: true });
    setUploading(false);

    if (error) {
      setUploadError(`アップロードに失敗しました（${error.message}）`);
      return;
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
      setTimeout(() => router.refresh(), 600);
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
          STL または 3MF（80MBまで）。アップロードすると、閉じたメッシュ・肉厚・造形サイズなどを
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
          {uploading ? "アップロード中..." : registering ? "検証しています..." : "ファイルを選ぶ"}
        </Button>
      </div>


      {(uploadError || state.error) && (
        <p className="text-[12px] text-danger">{uploadError ?? state.error}</p>
      )}
    </div>
  );
}
