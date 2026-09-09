import { readFileSync } from "node:fs";

/** Shared by the application and migration tools. The CA and hostname are both
 * verified; URL SSL flags cannot silently override this configuration. */
export function connectionOptions(connectionString) {
  const caPath = process.env.DATABASE_SSL_CA?.trim();
  const url = new URL(connectionString);
  if ([...url.searchParams.keys()].some((key) => key.startsWith("ssl"))) {
    throw new Error(
      "Use DATABASE_SSL_CA instead of SSL options in the database URL",
    );
  }
  if (
    process.env.NODE_ENV === "production" &&
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
    !caPath
  ) {
    throw new Error("DATABASE_SSL_CA is required for a production database");
  }
  return {
    connectionString,
    ...(caPath
      ? { ssl: { rejectUnauthorized: true, ca: readFileSync(caPath, "utf8") } }
      : {}),
  };
}
