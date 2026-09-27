import "server-only";
import type { DbFunctions } from "@/types/database";
import type { Db } from "./client";
import { queryResult } from "./result";
import { runFunction, type DomainFunction } from "./d1/functions";

/** Typed calls to D1 domain operations. No browser-facing SQL/RPC endpoint. */
export function call<K extends DomainFunction>(db: Db, name: K, args: DbFunctions[K]["Args"]) {
  return queryResult(runFunction(db, name, args));
}
