import { gunzipSync, zstdDecompressSync } from "node:zlib";
import { AnalysisBudget, MODEL_LIMITS, ModelLimitError } from "./limits.ts";

// Blender の .blend を読むための低レベルの部分：展開、ヘッダ、ブロック、DNA（構造体の定義）、ポインタの解決。
// 構造体の配置はファイルに入っている DNA から計算するので、Blender の版ごとの違いに追従できる。
// 対応はリトルエンディアン・64bit ポインタのファイルだけ（現行の Blender が保存するもの）。

export class BlendParseError extends Error {}

const MAGIC = "BLENDER";
const ZSTD_FRAME_MAGIC = 0xfd2fb528;
const GZIP_MAGIC = 0x8b1f;
// zstd の seekable format：独立したフレームの列のあとに、各フレームの大きさを並べたシークテーブルが付く
const ZSTD_SEEKABLE_MAGIC = 0x8f92eab1;
const ZSTD_SEEK_FOOTER_BYTES = 9;
const ZSTD_SEEK_DESCRIPTOR_OFFSET = 4;
const ZSTD_SEEK_MAGIC_OFFSET = 5;
const ZSTD_SEEK_CHECKSUM_FLAG = 0x80;
const ZSTD_SEEK_ENTRY_BYTES = 8;
const ZSTD_SEEK_CHECKSUM_BYTES = 4;
const ZSTD_SKIPPABLE_HEADER_BYTES = 8;
// 旧ヘッダ："BLENDER" + ポインタ（'-' は 64bit、'_' は 32bit）+ エンディアン（'v' / 'V'）+ 版（3桁）
const LEGACY_HEADER = { bytes: 12, pointer: 7, endian: 8, versionStart: 9 } as const;
const POINTER_64 = 0x2d;
const POINTER_32 = 0x5f;
const LITTLE_ENDIAN = 0x76;
// 新ヘッダ（Blender 5.0 以降）："BLENDER" + ヘッダ長（2桁）+ '-' + 形式の版（2桁）+ エンディアン + 版（4桁）
const LARGE_HEADER = {
  sizeStart: 7,
  sizeEnd: 9,
  separator: 9,
  formatStart: 10,
  formatEnd: 12,
  endian: 12,
  versionStart: 13,
  versionEnd: 17,
} as const;
const LARGE_BHEAD_FORMAT = 1;
const HEADER_SEPARATOR = 0x2d;
const POINTER_BYTES = 8;
// ブロックの見出しの並び。旧：code, len(int32), address, sdna(int32), count(int32)
const LEGACY_BHEAD = { bytes: 24, length: 4, address: 8, sdna: 16, count: 20 } as const;
// 新：code, sdna(int32), address, len(int64), count(int64)
const LARGE_BHEAD = { bytes: 32, sdna: 4, address: 8, length: 16, count: 24 } as const;
const CODE_BYTES = 4;
const DNA_ALIGNMENT = 4;
const INT16_BYTES = 2;
const INT32_BYTES = 4;
const FLOAT32_BYTES = 4;
// 処理時間の上限を確かめる間隔（ブロック数）
const BUDGET_CHECK_INTERVAL = 4096;
/** ヌルポインタ（どこも指さないアドレス） */
export const NULL_ADDRESS = BigInt(0);
// ID（名前付きのデータ）ではないブロック。これら以外のブロックが、続く DATA ブロックのポインタの範囲を始める
const NON_ID_CODES = new Set(["DATA", "REND", "TEST", "GLOB", "DNA1", "ENDB", "USER"]);

export type BlendBlock = {
  readonly index: number;
  readonly code: string;
  readonly address: bigint;
  readonly sdna: number;
  readonly count: number;
  readonly start: number;
  readonly length: number;
};

type Member = { type: string; offset: number; size: number; pointer: boolean };
type Struct = { name: string; length: number; members: Map<string, Member> };

function inflate(run: () => Buffer): Buffer {
  try {
    return run();
  } catch (error) {
    if (error instanceof RangeError)
      throw new ModelLimitError(".blend の展開後の大きさが上限を超えています");
    throw new BlendParseError(".blend の圧縮データが壊れています");
  }
}

function decompressZstd(buf: Buffer): Buffer {
  const footer = buf.length - ZSTD_SEEK_FOOTER_BYTES;
  if (footer < 0 || buf.readUInt32LE(footer + ZSTD_SEEK_MAGIC_OFFSET) !== ZSTD_SEEKABLE_MAGIC) {
    return inflate(() => zstdDecompressSync(buf, { maxOutputLength: MODEL_LIMITS.blendBytes }));
  }
  const frames = buf.readUInt32LE(footer);
  const checksum = (buf[footer + ZSTD_SEEK_DESCRIPTOR_OFFSET] & ZSTD_SEEK_CHECKSUM_FLAG) !== 0;
  const entryBytes = ZSTD_SEEK_ENTRY_BYTES + (checksum ? ZSTD_SEEK_CHECKSUM_BYTES : 0);
  const tableStart = footer - frames * entryBytes;
  const framesEnd = tableStart - ZSTD_SKIPPABLE_HEADER_BYTES;
  if (framesEnd < 0) throw new BlendParseError(".blend の圧縮データのシークテーブルが壊れています");

  const parts: Buffer[] = [];
  let compressedAt = 0;
  let total = 0;
  for (let i = 0; i < frames; i++) {
    const compressed = buf.readUInt32LE(tableStart + i * entryBytes);
    const size = buf.readUInt32LE(tableStart + i * entryBytes + INT32_BYTES);
    total += size;
    if (total > MODEL_LIMITS.blendBytes)
      throw new ModelLimitError(".blend の展開後の大きさが上限を超えています");
    if (compressedAt + compressed > framesEnd)
      throw new BlendParseError(".blend の圧縮データのシークテーブルが壊れています");
    const frame = buf.subarray(compressedAt, compressedAt + compressed);
    const part = inflate(() => zstdDecompressSync(frame, { maxOutputLength: Math.max(1, size) }));
    if (part.length !== size) throw new BlendParseError(".blend の圧縮データの大きさが一致しません");
    parts.push(part);
    compressedAt += compressed;
  }
  return Buffer.concat(parts, total);
}

/** 圧縮された .blend（zstd / gzip）を展開する。圧縮されていなければそのまま返す */
export function decompressBlend(buf: Buffer): Buffer {
  if (buf.length >= INT32_BYTES && buf.readUInt32LE(0) === ZSTD_FRAME_MAGIC) return decompressZstd(buf);
  if (buf.length >= INT16_BYTES && buf.readUInt16LE(0) === GZIP_MAGIC)
    return inflate(() => gunzipSync(buf, { maxOutputLength: MODEL_LIMITS.blendBytes }));
  return buf;
}

// DNA のメンバー名（"*next"、"loc[3]"、"(*func)()"）から、ポインタか・配列の要素数・素の名前を取り出す
function parseMemberName(raw: string) {
  const pointer = raw.startsWith("*") || raw.startsWith("(*");
  const count = [...raw.matchAll(/\[(\d+)\]/g)].reduce((product, match) => product * Number(match[1]), 1);
  const name = raw.replace(/^\(?\*+/, "").replace(/\).*$/, "").replace(/\[.*$/, "");
  return { pointer, count, name };
}

/** 展開済みの .blend。ブロックと DNA を読み、構造体のメンバーを名前で読めるようにする */
export class BlendFile {
  readonly version: number;
  readonly blocks: BlendBlock[] = [];
  private readonly buf: Buffer;
  private readonly structs: Struct[] = [];
  private readonly structByName = new Map<string, Struct>();
  private readonly scopeOf: Int32Array;
  private readonly scopes = new Map<number, Map<bigint, BlendBlock>>();
  private readonly ids = new Map<bigint, BlendBlock>();

  constructor(buf: Buffer, budget: AnalysisBudget) {
    this.buf = buf;
    if (buf.length < LEGACY_HEADER.bytes || buf.toString("latin1", 0, MAGIC.length) !== MAGIC)
      throw new BlendParseError("Blender のファイル（.blend）ではありません");

    let headerBytes: number;
    let endian: number;
    let largeBHead: boolean;
    const pointerMark = buf[LEGACY_HEADER.pointer];
    if (pointerMark === POINTER_64 || pointerMark === POINTER_32) {
      if (pointerMark === POINTER_32)
        throw new BlendParseError("32bit 版の Blender で保存された .blend には対応していません");
      headerBytes = LEGACY_HEADER.bytes;
      endian = buf[LEGACY_HEADER.endian];
      this.version = Number(buf.toString("latin1", LEGACY_HEADER.versionStart, LEGACY_HEADER.bytes));
      largeBHead = false;
    } else {
      headerBytes = Number(buf.toString("latin1", LARGE_HEADER.sizeStart, LARGE_HEADER.sizeEnd));
      const format = Number(buf.toString("latin1", LARGE_HEADER.formatStart, LARGE_HEADER.formatEnd));
      if (
        !Number.isInteger(headerBytes) ||
        headerBytes < LARGE_HEADER.versionEnd ||
        buf[LARGE_HEADER.separator] !== HEADER_SEPARATOR ||
        format !== LARGE_BHEAD_FORMAT ||
        buf.length < headerBytes
      )
        throw new BlendParseError("この版の .blend のヘッダには対応していません");
      endian = buf[LARGE_HEADER.endian];
      this.version = Number(buf.toString("latin1", LARGE_HEADER.versionStart, LARGE_HEADER.versionEnd));
      largeBHead = true;
    }
    if (endian !== LITTLE_ENDIAN)
      throw new BlendParseError("ビッグエンディアンで保存された .blend には対応していません");

    // --- ブロック ---
    const head = largeBHead ? LARGE_BHEAD : LEGACY_BHEAD;
    let at = headerBytes;
    let ended = false;
    while (at + head.bytes <= buf.length) {
      if (this.blocks.length >= MODEL_LIMITS.blendBlocks)
        throw new ModelLimitError(".blend のブロックが多すぎます");
      if (this.blocks.length % BUDGET_CHECK_INTERVAL === 0) budget.check();
      const code = buf.toString("latin1", at, at + CODE_BYTES).replace(/\0+$/, "");
      const sdna = buf.readInt32LE(at + head.sdna);
      const address = buf.readBigUInt64LE(at + head.address);
      const length = largeBHead ? Number(buf.readBigInt64LE(at + head.length)) : buf.readInt32LE(at + head.length);
      const count = largeBHead ? Number(buf.readBigInt64LE(at + head.count)) : buf.readInt32LE(at + head.count);
      const start = at + head.bytes;
      if (!Number.isSafeInteger(length) || length < 0 || count < 0 || start + length > buf.length)
        throw new BlendParseError(".blend のブロックの範囲が不正です（ファイルが壊れている可能性があります）");
      this.blocks.push({ index: this.blocks.length, code, address, sdna, count, start, length });
      if (code === "ENDB") {
        ended = true;
        break;
      }
      at = start + length;
    }
    if (!ended) throw new BlendParseError(".blend が途中で切れています");

    const dna = this.blocks.find((block) => block.code === "DNA1");
    if (!dna) throw new BlendParseError(".blend に構造体の定義（DNA）がありません");
    this.readDna(dna);

    // --- ポインタの範囲 ---
    // DATA ブロックのアドレスは、直前の ID のブロックから次の ID のブロックまでの範囲でだけ一意（Blender 5.0 以降）。
    // ID のブロックのアドレスはファイル全体で一意なので、別の ID を指すポインタは全体から探す
    this.scopeOf = new Int32Array(this.blocks.length);
    let scope = -1;
    for (const block of this.blocks) {
      if (block.code !== "DATA") {
        scope = block.index;
        this.scopes.set(scope, new Map([[block.address, block]]));
        if (!NON_ID_CODES.has(block.code) && block.address !== NULL_ADDRESS) this.ids.set(block.address, block);
      } else {
        this.scopes.get(scope)?.set(block.address, block);
      }
      this.scopeOf[block.index] = scope;
    }
  }

  private readDna(dna: BlendBlock) {
    const end = dna.start + dna.length;
    let p = dna.start;
    const need = (bytes: number) => {
      if (p + bytes > end) throw new BlendParseError(".blend の構造体の定義（DNA）が壊れています");
    };
    const tag = (expected: string) => {
      need(CODE_BYTES);
      if (this.buf.toString("latin1", p, p + CODE_BYTES) !== expected)
        throw new BlendParseError(".blend の構造体の定義（DNA）が壊れています");
      p += CODE_BYTES;
    };
    const align = () => {
      p = dna.start + Math.ceil((p - dna.start) / DNA_ALIGNMENT) * DNA_ALIGNMENT;
    };
    const count = () => {
      need(INT32_BYTES);
      const value = this.buf.readInt32LE(p);
      p += INT32_BYTES;
      if (value < 0 || value > MODEL_LIMITS.blendBlocks)
        throw new BlendParseError(".blend の構造体の定義（DNA）が壊れています");
      return value;
    };
    const strings = () => {
      const out: string[] = [];
      for (let i = count(); i > 0; i--) {
        const zero = this.buf.indexOf(0, p);
        if (zero === -1 || zero >= end) throw new BlendParseError(".blend の構造体の定義（DNA）が壊れています");
        out.push(this.buf.toString("latin1", p, zero));
        p = zero + 1;
      }
      align();
      return out;
    };

    tag("SDNA");
    tag("NAME");
    const names = strings();
    tag("TYPE");
    const types = strings();
    tag("TLEN");
    need(types.length * INT16_BYTES);
    const typeLengths = types.map((_, i) => this.buf.readUInt16LE(p + i * INT16_BYTES));
    p += types.length * INT16_BYTES;
    align();
    tag("STRC");
    for (let s = count(); s > 0; s--) {
      need(INT32_BYTES);
      const type = this.buf.readUInt16LE(p);
      const memberCount = this.buf.readUInt16LE(p + INT16_BYTES);
      p += INT32_BYTES;
      need(memberCount * INT32_BYTES);
      if (type >= types.length) throw new BlendParseError(".blend の構造体の定義（DNA）が壊れています");
      const members = new Map<string, Member>();
      let offset = 0;
      for (let m = 0; m < memberCount; m++) {
        const memberType = this.buf.readUInt16LE(p);
        const memberName = this.buf.readUInt16LE(p + INT16_BYTES);
        p += INT32_BYTES;
        if (memberType >= types.length || memberName >= names.length)
          throw new BlendParseError(".blend の構造体の定義（DNA）が壊れています");
        const parsed = parseMemberName(names[memberName]);
        const size = (parsed.pointer ? POINTER_BYTES : typeLengths[memberType]) * parsed.count;
        members.set(parsed.name, { type: types[memberType], offset, size, pointer: parsed.pointer });
        offset += size;
      }
      if (offset !== typeLengths[type])
        throw new BlendParseError(".blend の構造体の定義（DNA）の大きさが一致しません");
      const struct = { name: types[type], length: typeLengths[type], members };
      this.structs.push(struct);
      this.structByName.set(struct.name, struct);
    }
  }

  /** ブロックの中身の構造体の名前（DNA の番号から） */
  structName(block: BlendBlock): string | null {
    return this.structs[block.sdna]?.name ?? null;
  }

  has(structName: string, member: string) {
    return this.structByName.get(structName)?.members.has(member) ?? false;
  }

  /** 候補のうち、この版の DNA にあるメンバー名を返す（名前が版で変わったもの用） */
  memberName(structName: string, candidates: readonly string[]) {
    const found = candidates.find((candidate) => this.has(structName, candidate));
    if (!found) throw new BlendParseError(`.blend の ${structName} に ${candidates.join(" / ")} がありません`);
    return found;
  }

  /** 構造体の先頭からのオフセット（"unit.scale_length" のような埋め込み構造体もたどる）と、そのメンバーの大きさ */
  member(structName: string, path: string) {
    let struct = this.structByName.get(structName);
    let offset = 0;
    let found: Member | undefined;
    for (const part of path.split(".")) {
      found = struct?.members.get(part);
      if (!found) throw new BlendParseError(`.blend の ${structName} に ${path} がありません`);
      offset += found.offset;
      struct = this.structByName.get(found.type);
    }
    return { offset, size: found!.size };
  }

  structLength(structName: string) {
    const struct = this.structByName.get(structName);
    if (!struct) throw new BlendParseError(`.blend に ${structName} の定義がありません`);
    return struct.length;
  }

  /** ブロックの element 番目の構造体の path の位置（ファイル全体でのオフセット）。範囲外なら例外 */
  private at(block: BlendBlock, structName: string, path: string, bytes: number, element = 0) {
    const { offset, size } = this.member(structName, path);
    const relative = element * this.structLength(structName) + offset;
    if (bytes > size || relative < 0 || relative + bytes > block.length)
      throw new BlendParseError(`.blend の ${structName}.${path} がブロックの範囲外です`);
    return block.start + relative;
  }

  int8(block: BlendBlock, structName: string, path: string, element = 0) {
    return this.buf.readInt8(this.at(block, structName, path, 1, element));
  }

  int16(block: BlendBlock, structName: string, path: string, element = 0) {
    return this.buf.readInt16LE(this.at(block, structName, path, INT16_BYTES, element));
  }

  int32(block: BlendBlock, structName: string, path: string, element = 0) {
    return this.buf.readInt32LE(this.at(block, structName, path, INT32_BYTES, element));
  }

  floats(block: BlendBlock, structName: string, path: string, count: number, element = 0) {
    const start = this.at(block, structName, path, count * FLOAT32_BYTES, element);
    return Array.from({ length: count }, (_, i) => this.buf.readFloatLE(start + i * FLOAT32_BYTES));
  }

  pointer(block: BlendBlock, structName: string, path: string, element = 0) {
    return this.buf.readBigUInt64LE(this.at(block, structName, path, POINTER_BYTES, element));
  }

  string(block: BlendBlock, structName: string, path: string, element = 0) {
    const { size } = this.member(structName, path);
    const start = this.at(block, structName, path, size, element);
    const zero = this.buf.indexOf(0, start);
    return this.buf.toString("utf8", start, zero === -1 || zero > start + size ? start + size : zero);
  }

  /** 名前の文字列だけが入ったブロック（char*）を読む */
  blockString(block: BlendBlock) {
    const zero = this.buf.indexOf(0, block.start);
    const end = block.start + block.length;
    return this.buf.toString("utf8", block.start, zero === -1 || zero > end ? end : zero);
  }

  /** ID のブロックの名前（先頭の2文字の種類 "OB" などを除く） */
  idName(block: BlendBlock) {
    const structName = this.structName(block);
    if (!structName || !this.has(structName, "id"))
      throw new BlendParseError(".blend の ID ではないブロックの名前を読もうとしました");
    return this.string(block, structName, "id.name").slice(2);
  }

  /** ポインタの参照先のブロック。同じ ID の範囲の DATA ブロックを先に、なければ ID のブロックを探す */
  resolve(from: BlendBlock, address: bigint): BlendBlock | null {
    if (address === NULL_ADDRESS) return null;
    return this.scopes.get(this.scopeOf[from.index])?.get(address) ?? this.ids.get(address) ?? null;
  }

  /** ListBase の要素のブロックを順にたどる（どの要素も先頭が next ポインタ） */
  *list(owner: BlendBlock, structName: string, path: string, budget: AnalysisBudget): Generator<BlendBlock> {
    let address = this.pointer(owner, structName, `${path}.first`);
    const seen = new Set<bigint>();
    while (address !== NULL_ADDRESS) {
      if (seen.has(address) || seen.size >= MODEL_LIMITS.blendBlocks)
        throw new BlendParseError(".blend のリストが循環しています");
      seen.add(address);
      const item = this.resolve(owner, address);
      if (!item || item.length < POINTER_BYTES) return;
      budget.check();
      yield item;
      address = this.buf.readBigUInt64LE(item.start);
    }
  }

  /** 数値の配列（float / int）のブロックを読む。要素数に足りなければ例外 */
  readFloat32Array(block: BlendBlock | null, count: number, what: string) {
    if (!block || block.length < count * FLOAT32_BYTES)
      throw new BlendParseError(`.blend の${what}のデータが足りません`);
    const out = new Float64Array(count);
    for (let i = 0; i < count; i++) out[i] = this.buf.readFloatLE(block.start + i * FLOAT32_BYTES);
    return out;
  }

  readInt32Array(block: BlendBlock | null, count: number, what: string) {
    if (!block || block.length < count * INT32_BYTES)
      throw new BlendParseError(`.blend の${what}のデータが足りません`);
    const out = new Int32Array(count);
    for (let i = 0; i < count; i++) out[i] = this.buf.readInt32LE(block.start + i * INT32_BYTES);
    return out;
  }
}
