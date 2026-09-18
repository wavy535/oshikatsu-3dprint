"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { uploadFile } from "@/lib/files/upload";
import { registerPrintAssetsAction } from "@/lib/works/asset-actions";
import { registerArAssetAction } from "@/lib/works/ar-actions";
import { MAX_PRINT_FILES, MAX_PRINT_UPLOAD_BYTES } from "@/lib/works/asset-limits";
import { checkModelFileSize } from "@/lib/print/limits";
import { AR_BLEND } from "@/lib/ar/config";
import { Button } from "@/components/ui/button";

type Asset = { id: string; file_name: string };

/** One bounded batch, uploaded sequentially to avoid concurrent model parsing and memory spikes. */
export function AssetUploader({ workId, assets = [], purpose = "print", currentFile }: {
  workId: string;
  assets?: Asset[];
  purpose?: "print" | "ar";
  currentFile?: string;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const locked = useRef(false);
  const [target, setTarget] = useState("");
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ar = purpose === "ar";
  const multiple = !ar && !target;

  async function onPick(files: File[]) {
    if (locked.current || !files.length) return;
    setError(null);
    if ((!multiple && files.length !== 1) || (multiple && assets.length + files.length > MAX_PRINT_FILES)) {
      setError(multiple ? "1作品に登録できる印刷用ファイルは16個までです" : "差し替えるファイルを1つ選んでください");
      return;
    }
    try {
      for (const file of files) {
        if (!(ar ? /\.(stl|3mf|blend)$/i : /\.(stl|3mf)$/i).test(file.name)) throw new Error(`${file.name}: 対応していないファイル形式です`);
        checkModelFileSize(file.size);
      }
      if (files.reduce((sum, file) => sum + file.size, 0) > MAX_PRINT_UPLOAD_BYTES) throw new Error("一度に送信できる合計サイズは80MiBまでです");
    } catch (error) { setError((error as Error).message); return; }
    locked.current = true;
    try {
      const uploaded = [];
      for (const [index, file] of files.entries()) {
        setProgress(`${index + 1}/${files.length} アップロード中：${file.name}`);
        const path = await uploadFile(ar ? "work-ar" : "work-stl", file, workId);
        uploaded.push({ storage_path: path, file_name: file.name, file_size_bytes: file.size });
      }
      setProgress("ファイルを検証・保存しています…");
      const data = new FormData();
      if (ar) {
        data.set("workId", workId);
        data.set("storagePath", uploaded[0].storage_path);
        data.set("fileName", uploaded[0].file_name);
        data.set("fileSize", String(uploaded[0].file_size_bytes));
      } else {
        data.set("payload", JSON.stringify({ workId, assetId: target || undefined, files: uploaded }));
      }
      const result = await (ar ? registerArAssetAction : registerPrintAssetsAction)({ error: null }, data);
      if (result.error) throw new Error(result.error);
      setTarget("");
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "アップロードに失敗しました");
    } finally {
      locked.current = false;
      setProgress(null);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
      <h2 className="text-[13px] font-semibold text-ink">{ar ? "AR用の3Dデータ（任意）" : "印刷用の3Dデータ"}</h2>
      <p className="text-[12px] leading-5 text-muted-foreground">
        {ar
          ? `組み立てた配置のSTL・3MF・Blender (.blend) を登録してください。基準サイズ（15cm用）の実寸で用意すると、選んだサイズに合わせて拡大・縮小します。印刷用ファイルや代行費には影響しません。STL・3MFはmm、Blenderは1単位＝${AR_BLEND.mmPerUnit}mmです。`
          : "1作品を構成するSTL・3MFをまとめて選択、またはドロップできます。全ファイルを印刷する一式として、材料量・時間・代行費を合算します。1作品16ファイル、一度に合計80MiBまで。"}
      </p>
      {currentFile && <p className="break-all text-[12px]">登録済み：{currentFile}</p>}
      {!ar && assets.length > 0 && (
        <label className="flex flex-col gap-1 text-[12px]">
          アップロード方法
          <select value={target} disabled={Boolean(progress)} onChange={(event) => setTarget(event.target.value)} className="min-w-0 rounded-md border border-line p-2">
            <option value="">ファイルを追加する</option>
            {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.file_name} を差し替える</option>)}
          </select>
        </label>
      )}
      <div onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void onPick(Array.from(event.dataTransfer.files)); }} className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line px-4 py-6 text-center">
        <Upload className="size-6 text-muted-foreground" aria-hidden />
        <input ref={input} type="file" aria-label={ar ? "AR用ファイル" : "印刷用ファイル"} accept={ar ? ".stl,.3mf,.blend" : ".stl,.3mf"} multiple={multiple} disabled={Boolean(progress)} className="hidden" onChange={(event) => { void onPick(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
        <Button type="button" size="sm" disabled={Boolean(progress)} onClick={() => input.current?.click()}>{ar ? "AR用ファイルを選ぶ" : target ? "差し替えるファイルを選ぶ" : "印刷用ファイルを選ぶ"}</Button>
        {progress && <p role="status" className="break-all text-[12px] text-muted-foreground">{progress}</p>}
      </div>
      {error && <p role="alert" className="text-[12px] text-danger">{error}</p>}
    </section>
  );
}
