/** Stable app URL; the server signs the S3 object URL at request time. */
export function publicUrl(
  bucket: "work-images" | "avatars",
  path: string | null | undefined,
) {
  if (!path) return null;
  return `/api/files/public/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export const workImageUrl = (path: string | null | undefined) =>
  publicUrl("work-images", path);
