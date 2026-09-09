import { crc32, inflateRawSync } from "node:zlib";
import { MODEL_LIMITS, ModelLimitError } from "./limits.ts";

// 3MF は ZIP コンテナなので、中の 3D/3dmodel.model を取り出す必要がある。
// この用途のためだけに依存を増やしたくないので、必要な範囲の ZIP だけを自前で読む。
// （対応：deflate と無圧縮のみ。暗号化・スパン・ZIP64 は明示的にエラーにする）

const EOCD_SIG = 0x06054b50;
const EOCD64_LOCATOR_SIG = 0x07064b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

export type ZipEntry = {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
  crc: number;
};

export class ZipError extends Error {}

function findEndOfCentralDirectory(buf: Buffer): number {
  // コメント付き ZIP でも見つかるよう、末尾から最大 64KB + 22 バイト遡る
  const maxBack = Math.min(buf.length, 0xffff + 22);
  for (let i = buf.length - 22; i >= buf.length - maxBack; i--) {
    if (i < 0) break;
    if (
      buf.readUInt32LE(i) === EOCD_SIG &&
      i + 22 + buf.readUInt16LE(i + 20) === buf.length
    )
      return i;
  }
  throw new ZipError(
    "ZIPの終端レコードが見つかりません（ファイルが壊れている可能性があります）",
  );
}

export function listZipEntries(buf: Buffer): ZipEntry[] {
  const eocd = findEndOfCentralDirectory(buf);

  if (eocd >= 20 && buf.readUInt32LE(eocd - 20) === EOCD64_LOCATOR_SIG) {
    throw new ZipError("ZIP64 形式には対応していません");
  }

  const entryCount = buf.readUInt16LE(eocd + 10);
  const centralSize = buf.readUInt32LE(eocd + 12);
  const centralOffset = buf.readUInt32LE(eocd + 16);

  if (
    buf.readUInt16LE(eocd + 4) !== 0 ||
    buf.readUInt16LE(eocd + 6) !== 0 ||
    buf.readUInt16LE(eocd + 8) !== entryCount
  ) {
    throw new ZipError("分割されたZIPには対応していません");
  }

  if (centralOffset === 0xffffffff || centralSize === 0xffffffff) {
    throw new ZipError("ZIP64 形式には対応していません");
  }
  if (entryCount > MODEL_LIMITS.zipEntries)
    throw new ModelLimitError("3MF内のファイル数が多すぎます");
  const centralEnd = centralOffset + centralSize;
  if (centralEnd !== eocd)
    throw new ZipError("ZIPの中央ディレクトリのサイズが不正です");

  const entries: ZipEntry[] = [];
  let p = centralOffset;

  for (let i = 0; i < entryCount; i++) {
    if (p + 46 > centralEnd || buf.readUInt32LE(p) !== CENTRAL_SIG) {
      throw new ZipError("ZIPの中央ディレクトリが壊れています");
    }
    const flags = buf.readUInt16LE(p + 8);
    if (flags & 0x01) throw new ZipError("暗号化されたZIPには対応していません");

    const compressionMethod = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const uncompressedSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localHeaderOffset = buf.readUInt32LE(p + 42);
    if (
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localHeaderOffset === 0xffffffff
    )
      throw new ZipError("ZIP64 形式には対応していません");
    if (buf.readUInt16LE(p + 34) !== 0)
      throw new ZipError("分割されたZIPには対応していません");
    if (
      p + 46 + nameLen + extraLen + commentLen > centralEnd ||
      localHeaderOffset + 30 > centralOffset
    )
      throw new ZipError("ZIPのエントリの範囲が不正です");
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);

    entries.push({
      name,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
      crc: buf.readUInt32LE(p + 16),
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  if (p !== centralEnd) throw new ZipError("ZIPのエントリ数が一致しません");

  return entries;
}

export function readZipEntry(
  buf: Buffer,
  entry: ZipEntry,
  maxBytes = MODEL_LIMITS.xmlBytes,
): Buffer {
  if (entry.uncompressedSize > maxBytes)
    throw new ModelLimitError(
      "3MFの展開後のモデルは64MiBまでです。面数を減らすか、パーツごとに分けてください",
    );
  const p = entry.localHeaderOffset;
  if (p + 30 > buf.length || buf.readUInt32LE(p) !== LOCAL_SIG) {
    throw new ZipError(`ZIPのローカルヘッダが読めません: ${entry.name}`);
  }
  const nameLen = buf.readUInt16LE(p + 26);
  const extraLen = buf.readUInt16LE(p + 28);
  const start = p + 30 + nameLen + extraLen;
  if (
    start + entry.compressedSize > buf.length ||
    buf.readUInt16LE(p + 8) !== entry.compressionMethod ||
    buf.readUInt16LE(p + 6) & 1
  )
    throw new ZipError("ZIPの圧縮データの範囲・形式が不正です");
  const raw = buf.subarray(start, start + entry.compressedSize);

  let data: Buffer;
  if (entry.compressionMethod === 0) {
    data = raw;
  } else if (entry.compressionMethod === 8) {
    try {
      // Enforce the actual output size even if the ZIP's declared size is false.
      data = inflateRawSync(raw, {
        maxOutputLength: Math.max(
          1,
          Math.min(maxBytes, entry.uncompressedSize),
        ),
      });
    } catch {
      throw new ZipError(
        "3MFの圧縮データが壊れているか、展開サイズが申告値・上限を超えています",
      );
    }
  } else {
    throw new ZipError(
      `未対応の圧縮方式です（method=${entry.compressionMethod}）: ${entry.name}`,
    );
  }
  if (data.length !== entry.uncompressedSize || crc32(data) !== entry.crc)
    throw new ZipError("ZIPの展開サイズまたはチェックサムが一致しません");
  return data;
}

// 大文字小文字を無視してエントリを1件取り出す
export function extractZipFile(buf: Buffer, path: string): Buffer | null {
  const entries = listZipEntries(buf);
  const target = path.toLowerCase();
  const hit = entries.find((e) => e.name.toLowerCase() === target);
  return hit ? readZipEntry(buf, hit) : null;
}
