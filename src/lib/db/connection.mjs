import { readFileSync } from "node:fs";

/** Shared by the application and migration tools. The CA and hostname are both
 * verified; URL SSL flags cannot silently override this configuration. */
export function connectionOptions(connectionString) {
  const caPath = process.env.DATABASE_SSL_CA?.trim();
  const url = new URL(connectionString);
  const useTls = process.env.DATABASE_SSL_MODE === "verify-full" || Boolean(caPath);
  if ([...url.searchParams.keys()].some((key) => key.startsWith("ssl"))) {
    throw new Error(
      "Use DATABASE_SSL_CA instead of SSL options in the database URL",
    );
  }
  if (
    process.env.NODE_ENV === "production" &&
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
    !useTls
  ) {
    throw new Error("DATABASE_SSL_MODE=verify-full or DATABASE_SSL_CA is required for a production database");
  }
  return {
    connectionString,
    ...(useTls
      ? { ssl: { rejectUnauthorized: true, ...(caPath ? { ca: readFileSync(caPath, "utf8") } : {}) } }
      : {}),
  };
}
