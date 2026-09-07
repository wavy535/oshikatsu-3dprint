import { inflateRawSync } from "node:zlib";

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
};

export class ZipError extends Error {}

function findEndOfCentralDirectory(buf: Buffer): number {
  // コメント付き ZIP でも見つかるよう、末尾から最大 64KB + 22 バイト遡る
  const maxBack = Math.min(buf.length, 0xffff + 22);
  for (let i = buf.length - 22; i >= buf.length - maxBack; i--) {
    if (i < 0) break;
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  throw new ZipError("ZIPの終端レコードが見つかりません（ファイルが壊れている可能性があります）");
}

export function listZipEntries(buf: Buffer): ZipEntry[] {
  const eocd = findEndOfCentralDirectory(buf);

  if (eocd >= 20 && buf.readUInt32LE(eocd - 20) === EOCD64_LOCATOR_SIG) {
    throw new ZipError("ZIP64 形式には対応していません");
  }

  const entryCount = buf.readUInt16LE(eocd + 10);
  const centralSize = buf.readUInt32LE(eocd + 12);
  const centralOffset = buf.readUInt32LE(eocd + 16);

  if (centralOffset === 0xffffffff || centralSize === 0xffffffff) {
    throw new ZipError("ZIP64 形式には対応していません");
  }

  const entries: ZipEntry[] = [];
  let p = centralOffset;

  for (let i = 0; i < entryCount; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CENTRAL_SIG) {
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
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);

    entries.push({ name, compressionMethod, compressedSize, uncompressedSize, localHeaderOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
}

export function readZipEntry(buf: Buffer, entry: ZipEntry): Buffer {
  const p = entry.localHeaderOffset;
  if (p + 30 > buf.length || buf.readUInt32LE(p) !== LOCAL_SIG) {
    throw new ZipError(`ZIPのローカルヘッダが読めません: ${entry.name}`);
  }
  const nameLen = buf.readUInt16LE(p + 26);
  const extraLen = buf.readUInt16LE(p + 28);
  const start = p + 30 + nameLen + extraLen;
  const raw = buf.subarray(start, start + entry.compressedSize);

  if (entry.compressionMethod === 0) return Buffer.from(raw);
  if (entry.compressionMethod === 8) return inflateRawSync(raw);
  throw new ZipError(`未対応の圧縮方式です（method=${entry.compressionMethod}）: ${entry.name}`);
}

// 大文字小文字を無視してエントリを1件取り出す
export function extractZipFile(buf: Buffer, path: string): Buffer | null {
  const entries = listZipEntries(buf);
  const target = path.toLowerCase();
  const hit = entries.find((e) => e.name.toLowerCase() === target);
  return hit ? readZipEntry(buf, hit) : null;
}
