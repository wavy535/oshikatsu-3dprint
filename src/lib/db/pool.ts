import "server-only";
import { connectionOptions } from "./connection.mjs";
import { Pool, types, type PoolConfig } from "pg";
import { platform } from "@/lib/platform";

const localPools: Partial<Record<"auth" | "data", Pool>> = {};

function createPool(kind: "auth" | "data", config: PoolConfig) {
  const pool = new Pool({
    ...config,
    ...(kind === "data" ? { types: {
      getTypeParser(oid: number, format?: "text" | "binary") {
        if (format !== "binary") {
          if ([20, 1700].includes(oid)) return Number;
          if ([1114, 1184].includes(oid)) return (value: string) => new Date(value).toISOString();
          if (oid === 1082) return (value: string) => value;
        }
        return types.getTypeParser(oid, format);
      },
    } } : {}),
  });
  pool.on("error", () => console.error("PostgreSQL connection failed"));
  return pool;
}

export function getPool(kind: "auth" | "data") {
  const hyperdrive = platform().DATABASE;
  if (hyperdrive) {
    // Hyperdrive owns upstream pooling. Socket I/O must not cross invocations.
    // Each released pg connection closes; no background idle timer is required.
    return createPool(kind, {
      connectionString: hyperdrive.connectionString,
      max: 2, maxUses: 1, connectionTimeoutMillis: 10_000,
    });
  }
  if (process.env.APP_RUNTIME === "cloudflare") throw new Error("DATABASE binding is required");
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is required");
  return localPools[kind] ??= createPool(kind, {
    ...connectionOptions(url), max: 5, connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000, statement_timeout: 30_000,
  });
}
