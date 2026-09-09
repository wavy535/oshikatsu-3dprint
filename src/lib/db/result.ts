import "server-only";
import type { SelectQueryBuilder } from "kysely";
import { pageNumber } from "@/lib/pagination";

/** Lists without a total fetch one extra row instead of running COUNT as well.
 * The caller supplies a stable order (including a unique tie-breaker). */
export async function readPage<D, T extends keyof D, O>(
  query: SelectQueryBuilder<D, T, O>,
  requestedPage: unknown,
  size = 30,
) {
  const page = pageNumber(requestedPage);
  const rows = await query
    .limit(size + 1)
    .offset((page - 1) * size)
    .execute();
  return { items: rows.slice(0, size), page, hasNext: rows.length > size };
}

export type DatabaseError = { message: string; code?: string; detail?: string };
/** Form actions can display domain errors raised by PostgreSQL functions. */
export async function queryResult<T>(query: Promise<T>) {
  try {
    return { data: (await query) ?? null, error: null as DatabaseError | null };
  } catch (error) {
    const failure =
      error instanceof Error ? error : new Error("Database query failed");
    return { data: null, error: failure as DatabaseError };
  }
}

export async function firstResult<T>(
  query: Promise<{ data: T[] | null; error: DatabaseError | null }>,
) {
  const response = await query;
  return { ...response, data: response.data?.[0] ?? null };
}

export async function countResult(query: Promise<{ count: number }>) {
  const response = await queryResult(query);
  return {
    data: null,
    count: response.data?.count ?? null,
    error: response.error,
  };
}

export async function pageResult<D, T extends keyof D, O>(
  query: SelectQueryBuilder<D, T, O>,
  from: number,
  to: number,
) {
  const [rows, count] = await Promise.all([
    queryResult(
      query
        .limit(to - from + 1)
        .offset(from)
        .execute(),
    ),
    countResult(
      query
        .clearSelect()
        .clearOrderBy()
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .$castTo<{ count: number }>()
        .executeTakeFirstOrThrow(),
    ),
  ]);
  return { ...rows, count: count.count, error: rows.error ?? count.error };
}
