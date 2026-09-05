// DESIGN.md §6.2 の ActionResult 型。Server Action 間で共通利用する。
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };
