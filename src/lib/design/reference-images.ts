import { z } from "zod";

export const MAX_REFERENCE_IMAGES = 2;
export const MAX_IMAGE_BYTES = 300 * 1024;
export const MAX_IMAGE_EDGE = 1024;
export const CHAT_BODY_LIMIT = 1024 * 1024;
const prefix = "data:image/jpeg;base64,";

/** Header dimensions only; actual decoding happens in the browser/provider. */
export function imageDimensions(bytes: Uint8Array, mime: string): { width: number; height: number } | null {
  if (mime === "image/png") {
    if (bytes.length < 24 || ![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v) || String.fromCharCode(...bytes.slice(12, 16)) !== "IHDR") return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (mime !== "image/jpeg" || bytes[0] !== 255 || bytes[1] !== 216) return null;
  for (let i = 2; i + 4 < bytes.length;) {
    if (bytes[i++] !== 255) return null;
    while (bytes[i] === 255) i++;
    const marker = bytes[i++];
    if (marker === 218 || marker === 217) break;
    const length = bytes[i] * 256 + bytes[i + 1];
    if (length < 2 || i + length > bytes.length) return null;
    if ([192, 193, 194].includes(marker) && length >= 8)
      return { width: bytes[i + 5] * 256 + bytes[i + 6], height: bytes[i + 3] * 256 + bytes[i + 4] };
    i += length;
  }
  return null;
}

function boundedJpeg(url: string): boolean {
  if (!url.startsWith(prefix) || url.length > prefix.length + 4 * Math.ceil(MAX_IMAGE_BYTES / 3)) return false;
  const encoded = url.slice(prefix.length);
  if (!encoded.length || encoded.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return false;
  try {
    const raw = atob(encoded);
    if (raw.length > MAX_IMAGE_BYTES) return false;
    const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
    const size = imageDimensions(bytes, "image/jpeg");
    return !!size && size.width > 0 && size.height > 0 && Math.max(size.width, size.height) <= MAX_IMAGE_EDGE && bytes.at(-2) === 255 && bytes.at(-1) === 217;
  } catch { return false; }
}

export const referenceImageSchema = z.object({ dataUrl: z.string().max(prefix.length + 4 * Math.ceil(MAX_IMAGE_BYTES / 3)).refine(boundedJpeg, "画像を読み込み直してください。") }).strict();
export type ReferenceImage = z.infer<typeof referenceImageSchema>;

/** Re-encode only the pixels: original file names and EXIF are not sent. */
export async function prepareReferenceImage(file: File): Promise<ReferenceImage> {
  if (!["image/jpeg", "image/png"].includes(file.type) || file.size > 8 * 1024 * 1024)
    throw new Error("画像は8MB以下のJPEG・PNGを選んでください。");
  const size = imageDimensions(new Uint8Array(await file.arrayBuffer()), file.type);
  if (!size || size.width < 1 || size.height < 1 || Math.max(size.width, size.height) > 8192 || size.width * size.height > 24_000_000)
    throw new Error("画像を読み取れないか、画素数が大きすぎます。縮小して再添付してください。");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("この端末で画像を処理できません。");
    context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.65, 0.45]) {
      const parsed = referenceImageSchema.safeParse({ dataUrl: canvas.toDataURL("image/jpeg", quality) });
      if (parsed.success) return parsed.data;
    }
    throw new Error("画像の容量を減らせませんでした。縮小して再添付してください。");
  } finally { bitmap.close(); }
}
