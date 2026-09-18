/** Shared by server-rendered pages and interactive forms; no component dependencies. */
const japaneseNumber = new Intl.NumberFormat("ja-JP");

export function yen(value: number | null | undefined) {
  return value == null ? "—" : `¥${japaneseNumber.format(value)}`;
}
