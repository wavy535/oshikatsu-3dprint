import { AR_CALIBRATION, AR_LIMITS, AR_MATERIALS, AR_MODEL, AR_ROOM } from "./config.ts";

// FNV-1a（32bit）で決まっている値
const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const HEX_RADIX = 16;
const HASH_HEX_LENGTH = 8;

/** 文字列から短い版を作る（FNV-1a 32bit、16進8桁）。暗号用途ではなく、変更の検出だけに使う */
export function revisionOf(source: string) {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash.toString(HEX_RADIX).padStart(HASH_HEX_LENGTH, "0");
}

/**
 * AR 用モデルの版。形・色を決める設定値と、生成処理の版から作る。
 * URL に rev として付けるので、設定やコードを変えると URL が変わり、端末に残った古いモデルが使われない。
 */
export function modelRevision() {
  return revisionOf(JSON.stringify([AR_MODEL, AR_ROOM, AR_MATERIALS, AR_CALIBRATION, AR_LIMITS]));
}
