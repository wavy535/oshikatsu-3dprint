/**
 * 電話番号の整形。Server Action（"use server"）からは同期関数を export できないので分けている。
 */

/** 日本の携帯番号（070/080/090 + 8桁）だけ受け付ける。SMS が届くのは携帯だけなので固定電話は弾く */
const JP_MOBILE = /^0[789]0\d{8}$/;

/** 「090-1234-5678」「090 1234 5678」→ E.164「+819012345678」 */
export function toE164(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (!JP_MOBILE.test(digits)) return null;
  return `+81${digits.slice(1)}`;
}

/** 「+819012345678」「819012345678」→「090-****-5678」。画面に出すときは真ん中を伏せる */
export function maskPhone(e164: string | null | undefined): string | null {
  if (!e164) return null;
  const digits = e164.replace(/\D/g, "");
  const local = digits.startsWith("81") ? `0${digits.slice(2)}` : digits;
  if (local.length !== 11) return local;
  return `${local.slice(0, 3)}-****-${local.slice(7)}`;
}
