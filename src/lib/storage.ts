/** 公開バケットのオブジェクトURL。work-images / avatars などの表示に使う。 */
export function publicUrl(bucket: string, path: string | null | undefined) {
  if (!path) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}

export const workImageUrl = (path: string | null | undefined) => publicUrl("work-images", path);
