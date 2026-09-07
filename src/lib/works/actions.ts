"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { validateAndPersistAsset } from "@/lib/works/asset-validation";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

// STEP1 の「検証する / 再検証」ボタンから呼ばれる。
// Server Action は誰でも POST できる入口なので、
// ここで「ログイン済みか」「その作品の持ち主か」を必ず確かめる。

const schema = z.object({
  assetId: z.string().uuid("不正なアセットIDです"),
});

export type ValidateAssetState = {
  error: string | null;
  status?: "passed" | "warning" | "failed";
  summary?: {
    objectCount: number;
    triangleCount: number;
    grams: number;
    hours: number;
    issues: { code: string; severity: string; message: string }[];
  };
};

export async function validateAssetAction(
  _prev: ValidateAssetState,
  formData: FormData
): Promise<ValidateAssetState> {
  const parsed = schema.safeParse({ assetId: formData.get("assetId") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "ログインが必要です" };

  // 所有者チェックは Service Role ではなくユーザー権限で行う（RLS を効かせる）
  const { data: asset } = await supabase
    .from("work_assets")
    .select("id, work_id")
    .eq("id", parsed.data.assetId)
    .maybeSingle();

  if (!asset) return { error: "対象の3Dデータが見つかりません" };

  const { data: work } = await supabase
    .from("works")
    .select("creator_id")
    .eq("id", asset.work_id)
    .maybeSingle();

  if (work?.creator_id !== user.id) {
    // 運営は再検証できる
    const admin = createServiceRoleClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.role !== "admin") return { error: "この作品を編集する権限がありません" };
  }

  const result = await validateAndPersistAsset(parsed.data.assetId);

  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath(`/creator/works/${asset.work_id}`);

  return {
    error: null,
    status: result.analysis.status,
    summary: {
      objectCount: result.analysis.objectCount,
      triangleCount: result.analysis.triangleCount,
      grams: result.analysis.baseEstimate.grams,
      hours: result.analysis.baseEstimate.hours,
      issues: result.analysis.issues.map((i) => ({
        code: i.code,
        severity: i.severity,
        message: i.message,
      })),
    },
  };
}
