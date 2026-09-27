import "server-only";
import { type Kysely } from "kysely";
import type { Database } from "@/types/database";
import { platform } from "@/lib/platform";
import { d1Database } from "./d1/runtime";

export type Db = Kysely<Database>;
export function database(userId?: string): Db {
  const binding = platform().DATABASE;
  if (!binding) throw new Error("DATABASE D1 binding is required");
  return d1Database(binding, { role: userId ? "app_user" : "app_guest", userId });
}
/** Call only after authorizing the operation on the server. */
export function serviceDatabase(): Db {
  const binding = platform().DATABASE;
  if (!binding) throw new Error("DATABASE D1 binding is required");
  return d1Database(binding, { role: "app_service" });
}
export { sql } from "kysely";
export { atomicBatch, assertQuery } from "./d1/runtime";
