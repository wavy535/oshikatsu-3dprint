// DESIGN.md §8.6: MIME + 拡張子 + マジックバイトの検証
const ALLOWED_ASSET_EXT = ["stl", "3mf", "obj", "step"] as const;
export type AssetExt = (typeof ALLOWED_ASSET_EXT)[number];

const ASSET_MAX_BYTES = 200 * 1024 * 1024; // products.product_assets.file_size の check 制約

export function extFromFilename(filename: string): AssetExt | null {
  const ext = filename.split(".").pop()?.toLowerCase();
  return (ALLOWED_ASSET_EXT as readonly string[]).includes(ext ?? "")
    ? (ext as AssetExt)
    : null;
}

export async function validateStlAsset(
  file: File
): Promise<{ ok: true; ext: AssetExt } | { ok: false; error: string }> {
  const ext = extFromFilename(file.name);
  if (!ext) {
    return { ok: false, error: "対応していないファイル形式です（stl/3mf/obj/step）" };
  }
  if (file.size <= 0 || file.size > ASSET_MAX_BYTES) {
    return { ok: false, error: "ファイルサイズは200MB以下にしてください" };
  }

  if (ext === "stl") {
    const head = new Uint8Array(await file.slice(0, 84).arrayBuffer());
    const text = new TextDecoder("ascii").decode(head.slice(0, 5));
    const isAscii = text.toLowerCase() === "solid";
    // バイナリSTL: 80byte ヘッダ + 4byte 三角形数 + 三角形ごと50byte
    const isBinaryShapeValid = head.length === 84 && (file.size - 84) % 50 === 0;
    if (!isAscii && !isBinaryShapeValid) {
      return { ok: false, error: "STLファイルとして不正なデータです" };
    }
  }

  return { ok: true, ext };
}
