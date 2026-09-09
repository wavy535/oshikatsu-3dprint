export function pageNumber(value: unknown): number {
  const n =
    typeof value === "string" || typeof value === "number"
      ? Number(value)
      : NaN;
  return Number.isSafeInteger(n) && n > 0 && n <= 1_000_000 ? n : 1;
}

/** Preserve filters, including an explicitly empty value that disables a default. */
export function pageHref(
  path: string,
  params: Record<string, string | string[] | undefined>,
  page: number,
  key = "page",
) {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(name, value);
    else if (Array.isArray(value) && value[0] !== undefined)
      query.set(name, value[0]);
  }
  if (page === 1) query.delete(key);
  else query.set(key, String(page));
  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
}
