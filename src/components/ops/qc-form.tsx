"use client";

import { useState } from "react";
import { useActionState } from "react";
import {
  AlertTriangle,
  Check,
  ImageIcon,
  Truck,
  Upload,
  X,
} from "lucide-react";

import { uploadFile } from "@/lib/files/upload";
import {
  createShipmentAction,
  submitQcAction,
  type OpsActionState,
} from "@/lib/ops/actions";
import {
  CARRIER_LABEL,
  REPRINT_CAUSE_LABEL,
  REPRINT_CAUSE_NOTE,
} from "@/lib/ops/labels";
import { Button } from "@/components/ui/button";
import type { ReprintCause, ShippingCarrier } from "@/types/db";

const initial: OpsActionState = { error: null };

const FIELD =
  "w-full rounded-lg border border-line bg-white px-3 py-2 text-[11.5px] text-ink outline-none focus:border-brand";

type CheckDefinition = { code: string; label: string; description: string };
type Photo = { path: string; previewUrl: string };

/**
 * 検品チェックリスト。
 *
 * 項目は `qc_check_definitions` から読む（画面にベタ書きしない）。
 * NG が1つでもあれば結果は「不合格」になり、原因の選択が必須になる。
 * 原因が「モデル側」のときだけクリエイターに修正依頼が飛ぶ（設計判断7）。
 */
export function QcForm({
  jobId,
  workId,
  checks,
}: {
  jobId: string;
  workId: string | null;
  checks: CheckDefinition[];
}) {
  const [state, action, pending] = useActionState(submitQcAction, initial);
  const [answers, setAnswers] = useState<Record<string, "pass" | "fail">>({});
  const [cause, setCause] = useState<ReprintCause | "">("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const failed = checks.filter((c) => answers[c.code] === "fail");
  const answeredAll = checks.every((c) => answers[c.code]);

  async function onPickPhotos(files: FileList) {
    if (!workId) {
      setUploadError("作品が特定できないため写真を保存できません");
      return;
    }
    setUploadError(null);
    setUploading(true);

    for (const file of Array.from(files).slice(0, 6 - photos.length)) {
      if (!file.type.startsWith("image/")) {
        setUploadError("画像ファイルを選んでください");
        continue;
      }
      if (file.size > 8 * 1024 * 1024) {
        setUploadError(`${file.name} は大きすぎます（8MBまで）`);
        continue;
      }
      let path: string;
      try {
        path = await uploadFile("qc-photos", file, workId, jobId);
      } catch (error) {
        setUploadError(
          error instanceof Error ? error.message : "アップロードに失敗しました",
        );
        continue;
      }

      setPhotos((prev) => [
        ...prev,
        { path, previewUrl: URL.createObjectURL(file) },
      ]);
    }
    setUploading(false);
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="jobId" value={jobId} />
      {Object.entries(answers).map(([code, value]) => (
        <input key={code} type="hidden" name={`check_${code}`} value={value} />
      ))}
      {photos.map((p) => (
        <input key={p.path} type="hidden" name="photoPaths" value={p.path} />
      ))}

      <section className="flex flex-col gap-2 rounded-xl border border-line bg-white p-3.5">
        <h2 className="text-[12.5px] font-semibold text-ink">
          検品チェックリスト（{checks.length}項目）
        </h2>

        {checks.map((c) => {
          const value = answers[c.code];
          return (
            <div
              key={c.code}
              className={`flex items-center gap-2.5 rounded-lg border-b border-line px-2 py-2 last:border-b-0 ${
                value === "fail" ? "bg-danger-bg" : ""
              }`}
            >
              <span
                className={`flex size-[18px] flex-none items-center justify-center rounded-md border ${
                  value === "pass"
                    ? "border-ok bg-ok text-white"
                    : value === "fail"
                      ? "border-danger bg-danger text-white"
                      : "border-line"
                }`}
                aria-hidden
              >
                {value === "pass" && <Check className="size-3" />}
                {value === "fail" && <X className="size-3" />}
              </span>

              <div className="flex flex-1 flex-col">
                <p className="text-[11.5px] font-semibold text-ink">
                  {c.label}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {c.description}
                </p>
              </div>

              <div className="flex flex-none overflow-hidden rounded-md border border-line">
                {(["pass", "fail"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() =>
                      setAnswers((prev) => ({ ...prev, [c.code]: v }))
                    }
                    className={`px-3 py-1 text-[10.5px] font-semibold transition-colors ${
                      value === v
                        ? v === "pass"
                          ? "bg-ok-bg text-ok"
                          : "bg-danger-bg text-danger"
                        : "bg-white text-muted-foreground hover:bg-ground"
                    }`}
                  >
                    {v === "pass" ? "OK" : "NG"}
                  </button>
                ))}
              </div>
            </div>
          );
        })}

        <label className="flex flex-col gap-1">
          <span className="text-[10.5px] text-muted-foreground">検品メモ</span>
          <textarea
            name="memo"
            rows={3}
            placeholder="気づいたことを書いてください。NG のときはクリエイターにそのまま届きます。"
            className={FIELD}
          />
        </label>
      </section>

      <section className="flex flex-col gap-2 rounded-xl border border-line bg-white p-3.5">
        <h2 className="text-[12.5px] font-semibold text-ink">
          検品写真（最大6枚）
        </h2>
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <span
              key={p.path}
              className="flex h-16 items-center justify-center overflow-hidden rounded-lg border border-line bg-ground"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.previewUrl}
                alt=""
                className="size-full object-cover"
              />
            </span>
          ))}
          {photos.length === 0 && (
            <span className="flex h-16 items-center justify-center gap-1 rounded-lg border border-line bg-ground text-[10px] text-muted-foreground">
              <ImageIcon className="size-3.5" aria-hidden />
              まだありません
            </span>
          )}
        </div>

        <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-line px-3 py-2 text-[10.5px] font-semibold text-brand hover:bg-ground">
          <Upload className="size-3" aria-hidden />
          {uploading ? "アップロード中…" : "検品写真を追加"}
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            disabled={uploading || photos.length >= 6}
            onChange={(e) => {
              if (e.target.files) void onPickPhotos(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        {uploadError && (
          <p className="text-[11px] text-danger">{uploadError}</p>
        )}
      </section>

      {failed.length > 0 && (
        <section className="flex flex-col gap-2 rounded-xl border border-danger/40 bg-danger-bg p-3.5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-3.5 text-danger" aria-hidden />
            <p className="text-[12.5px] font-semibold text-danger">
              NG {failed.length}件：{failed.map((f) => f.label).join("・")}
            </p>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[10.5px] text-muted-foreground">
              再印刷の原因
            </span>
            <select
              name="reprintCause"
              required
              value={cause}
              onChange={(e) => setCause(e.target.value as ReprintCause)}
              className={FIELD}
            >
              <option value="">選んでください</option>
              {(Object.keys(REPRINT_CAUSE_LABEL) as ReprintCause[]).map((c) => (
                <option key={c} value={c}>
                  {REPRINT_CAUSE_LABEL[c]}
                </option>
              ))}
            </select>
          </label>
          {cause && (
            <p className="text-[10.5px] text-danger">
              {REPRINT_CAUSE_NOTE[cause]}
            </p>
          )}
        </section>
      )}

      <div className="flex items-center gap-3">
        <Button
          type="submit"
          disabled={pending || !answeredAll || (failed.length > 0 && !cause)}
          variant={failed.length > 0 ? "destructive" : "default"}
        >
          {failed.length > 0 ? (
            "検品NGとして登録し、再印刷へ回す"
          ) : (
            <>
              <Check className="size-3.5" aria-hidden />
              検品OKとして登録
            </>
          )}
        </Button>
        {!answeredAll && (
          <p className="text-[11px] text-muted-foreground">
            すべての項目に OK / NG を付けてください。
          </p>
        )}
      </div>

      {state.error && <p className="text-[11px] text-danger">{state.error}</p>}
      {state.message && <p className="text-[11px] text-ok">{state.message}</p>}
    </form>
  );
}

/**
 * 発送登録。1注文1件（同梱前提）。
 * 注文が「発送済み」になるのも購入者への通知も、登録をきっかけにDB側が行う。
 */
export function ShipmentForm({
  orderId,
  enabled,
  giftWrapping,
}: {
  orderId: string;
  enabled: boolean;
  giftWrapping: boolean;
}) {
  const [state, action, pending] = useActionState(
    createShipmentAction,
    initial,
  );

  return (
    <form action={action} className="flex flex-col gap-2.5">
      <input type="hidden" name="orderId" value={orderId} />

      <label className="flex flex-col gap-1">
        <span className="text-[10.5px] text-muted-foreground">配送業者</span>
        <select
          name="carrier"
          defaultValue="yamato"
          className={FIELD}
          disabled={!enabled}
        >
          {(Object.keys(CARRIER_LABEL) as ShippingCarrier[]).map((c) => (
            <option key={c} value={c}>
              {CARRIER_LABEL[c]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[10.5px] text-muted-foreground">配送方法</span>
        <input
          name="serviceName"
          defaultValue="宅急便コンパクト"
          className={FIELD}
          disabled={!enabled}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[10.5px] text-muted-foreground">追跡番号</span>
        <input
          name="trackingNumber"
          required
          className={FIELD}
          disabled={!enabled}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[10.5px] text-muted-foreground">梱包資材</span>
        <input
          name="boxType"
          defaultValue={
            giftWrapping
              ? "宅急便コンパクト箱＋ラッピング"
              : "宅急便コンパクト箱"
          }
          className={FIELD}
          disabled={!enabled}
        />
      </label>

      <div className="grid grid-cols-2 gap-2.5">
        <label className="flex flex-col gap-1">
          <span className="text-[10.5px] text-muted-foreground">
            実測重量（g）
          </span>
          <input
            name="weightGrams"
            type="number"
            min="0"
            defaultValue={0}
            className={FIELD}
            disabled={!enabled}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10.5px] text-muted-foreground">
            三辺合計（cm）
          </span>
          <input
            name="sizeSumCm"
            type="number"
            min="0"
            defaultValue={0}
            className={FIELD}
            disabled={!enabled}
          />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[10.5px] text-muted-foreground">送料（円）</span>
        <input
          name="shippingFeeJpy"
          type="number"
          min="0"
          defaultValue={520}
          className={FIELD}
          disabled={!enabled}
        />
      </label>

      <Button type="submit" disabled={!enabled || pending} className="w-full">
        <Truck className="size-3.5" aria-hidden />
        発送を確定して「発送済み」に
      </Button>

      {!enabled && (
        <p className="text-[10.5px] text-muted-foreground">
          同じ注文のジョブがすべて検品OKになると登録できます。
        </p>
      )}
      {state.error && <p className="text-[11px] text-danger">{state.error}</p>}
      {state.message && <p className="text-[11px] text-ok">{state.message}</p>}
    </form>
  );
}
