import "server-only";
import { connectionOptions } from "./connection.mjs";
import { Pool, types } from "pg";

const state = globalThis as typeof globalThis & {
  appPools?: { auth: Pool; data: Pool };
};

export function getPool(kind: "auth" | "data") {
  if (!state.appPools) {
    const connectionString = process.env.DATABASE_URL?.trim();
    if (!connectionString) throw new Error("DATABASE_URL is required");
    const isLambda = Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
    const config = {
      ...connectionOptions(connectionString),
      max: isLambda ? 2 : 5,
      // A frozen Lambda cannot run idle timers. Close released connections so
      // they cannot keep Aurora awake; allow time for a paused DB to resume.
      maxUses: isLambda ? 1 : Infinity,
      connectionTimeoutMillis: isLambda ? 60_000 : 5_000,
      idleTimeoutMillis: 30_000,
      statement_timeout: 30_000,
    };
    state.appPools = {
      // Better Auth works with Date objects. Business DTOs use ISO strings.
      auth: new Pool(config),
      data: new Pool({
        ...config,
        types: {
          getTypeParser(oid, format) {
            if (format !== "binary") {
              if ([20, 1700].includes(oid)) return Number;
              if ([1114, 1184].includes(oid))
                return (value: string) => new Date(value).toISOString();
              if (oid === 1082) return (value: string) => value;
            }
            return types.getTypeParser(oid, format);
          },
        },
      }),
    };
    for (const pool of Object.values(state.appPools)) {
      pool.on("error", (error) =>
        console.error("PostgreSQL idle connection failed", error.message),
      );
    }
  }
  return state.appPools[kind];
}
