import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// DESIGN.md §5.2: STL は毎回「権限判定 → 署名付きURL(60秒)」を発行する。
// クリエイター本人（自作品）と Admin のみアクセス可（product_assets の RLS が担保）。
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ assetId: string }> }
) {
  const { assetId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // RLS が効くので、権限が無ければここで null になる
  const { data: asset } = await supabase
    .from("product_assets")
    .select("storage_path, original_name")
    .eq("id", assetId)
    .single();

  if (!asset) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from("product-assets")
    .createSignedUrl(asset.storage_path, 60, { download: asset.original_name });

  if (error || !data) {
    return NextResponse.json({ error: "sign_failed" }, { status: 500 });
  }

  await admin.from("asset_access_logs").insert({
    asset_id: assetId,
    user_id: user.id,
    action: "download",
  });

  return NextResponse.json({ url: data.signedUrl });
}
