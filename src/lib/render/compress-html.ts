import { brotliCompressSync, constants } from "node:zlib";

/** Only explicitly supported Brotli is selected; other clients use edge defaults. */
export function compressHtml(html: string, accepted: string | null): Uint8Array<ArrayBuffer> | null {
  const brotli = accepted?.split(",").some((entry) => {
    const [encoding, ...parameters] = entry.trim().split(";");
    const quality = parameters.find((value) => /^\s*q\s*=/i.test(value));
    return encoding.toLowerCase() === "br" &&
      (quality === undefined || Number(quality.split("=")[1]) > 0);
  });
  if (!brotli) return null;
  return new Uint8Array(brotliCompressSync(html, {
    params: { [constants.BROTLI_PARAM_QUALITY]: 6 },
  }));
}
