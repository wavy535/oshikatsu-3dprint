/** 売上の締めは日本時間。サーバーのタイムゾーンに依存させない。 */
export function isSalesMonth(value: unknown): value is string {
  return (
    typeof value === "string" && /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(value)
  );
}

export function monthKey(date = new Date()) {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 7);
}

export function shiftMonth(month: string, offset: number) {
  if (!isSalesMonth(month)) throw new Error("売上の対象月が不正です");
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}

export function monthStart(month: string) {
  if (!isSalesMonth(month)) throw new Error("売上の対象月が不正です");
  return `${month}-01T00:00:00+09:00`;
}
