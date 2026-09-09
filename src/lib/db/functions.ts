import "server-only";
import { sql } from "kysely";
import { setReturningFunctions, type DbFunctions } from "@/types/database";
import type { Db } from "./client";
import { queryResult } from "./result";

/** Parameterized calls to transactional domain functions. No HTTP database API. */
export function call<K extends keyof DbFunctions>(
  db: Db,
  name: K,
  args: DbFunctions[K]["Args"],
) {
  return queryResult(
    (async () => {
      const parameters = Object.entries(args)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => sql`${sql.id(key)} => ${value}`);
      const response = await sql<{
        value: unknown;
      }>`select to_jsonb(value) as value
      from public.${sql.id(name)}(${sql.join(parameters)}) as value`.execute(
        db,
      );
      const values = response.rows.map((row) => row.value);
      return (
        setReturningFunctions.has(name) ? values : values[0]
      ) as DbFunctions[K]["Returns"];
    })(),
  );
}
