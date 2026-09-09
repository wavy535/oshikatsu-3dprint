import { connectionOptions } from "../src/lib/db/connection.mjs";
import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import pg from "pg";
import { hashPassword } from "better-auth/crypto";
import { requiredEnv } from "./env.mjs";

const command = process.argv[2];
if (!["migrate", "seed", "test"].includes(command))
  throw new Error("Usage: node scripts/db.mjs migrate|seed|test");
const client = new pg.Client(
  connectionOptions(requiredEnv("MIGRATION_DATABASE_URL")),
);
await client.connect();
try {
  if (command === "migrate") {
    await client.query("select pg_advisory_lock(85401328)");
    await client.query(await readFile("db/bootstrap.sql", "utf8"));
    await client.query(
      "create table if not exists app_migrations (name text primary key, checksum text not null, applied_at timestamptz not null default now())",
    );
    for (const name of (await readdir("db/migrations"))
      .filter((n) => n.endsWith(".sql"))
      .sort()) {
      const source = await readFile(`db/migrations/${name}`, "utf8");
      const checksum = createHash("sha256").update(source).digest("hex");
      const previous = await client.query(
        "select checksum from app_migrations where name = $1",
        [name],
      );
      if (previous.rowCount) {
        if (previous.rows[0].checksum !== checksum)
          throw new Error(`Applied migration changed: ${name}`);
        continue;
      }
      await client.query("begin");
      try {
        await client.query(source);
        await client.query(
          "insert into app_migrations (name, checksum) values ($1, $2)",
          [name, checksum],
        );
        await client.query("commit");
        console.log(`Applied ${name}`);
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }
    // This is deliberately restricted to the checked-in local compose endpoint.
    // AWS login/password provisioning is separate from schema migrations.
    const target = new URL(requiredEnv("MIGRATION_DATABASE_URL"));
    if (
      ["127.0.0.1", "localhost"].includes(target.hostname) &&
      target.port === "55432" &&
      target.pathname === "/oshinest"
    ) {
      await client.query(
        "alter role app_runtime login password 'local-app-password'",
      );
    }
  } else if (command === "seed") {
    const target = new URL(requiredEnv("MIGRATION_DATABASE_URL"));
    if (
      !["127.0.0.1", "localhost"].includes(target.hostname) ||
      target.port !== "55432" ||
      target.pathname !== "/oshinest"
    ) {
      throw new Error(
        "Development fixtures may only be installed in the local compose database",
      );
    }
    const existing = await client.query("select count(*) from app_users");
    if (Number(existing.rows[0].count))
      throw new Error(
        "Seed requires an empty application database; existing data was preserved",
      );
    await client.query("begin");
    const password = await hashPassword("password123");
    const users = [
      [
        "11111111-1111-1111-1111-111111111111",
        "buyer@example.com",
        "ぬい活マニア",
        "buyer",
      ],
      [
        "22222222-2222-2222-2222-222222222222",
        "creator@example.com",
        "みるく工房",
        "creator",
      ],
      [
        "33333333-3333-3333-3333-333333333333",
        "creator2@example.com",
        "ぷち家具店",
        "creator",
      ],
      [
        "44444444-4444-4444-4444-444444444444",
        "admin@example.com",
        "OshiNest運営",
        "admin",
      ],
    ];
    for (const [id, email, name, role] of users) {
      await client.query(
        "insert into app_users (id, email, name, email_verified) values ($1, $2, $3, true)",
        [id, email, name],
      );
      await client.query(
        "insert into auth_accounts (id, user_id, account_id, provider_id, password) values ($1, $2::uuid, ($2::uuid)::text, 'credential', $3)",
        [randomUUID(), id, password],
      );
      await client.query("update profiles set role = $2 where id = $1", [
        id,
        role,
      ]);
    }
    await client.query(await readFile("db/seed.sql", "utf8"));
    await client.query("commit");
    console.log("Created development accounts and fixtures");
  } else {
    let failures = 0;
    for (const name of (await readdir("db/tests"))
      .filter((n) => n.endsWith(".sql"))
      .sort()) {
      const results = await client.query(
        await readFile(`db/tests/${name}`, "utf8"),
      );
      const lines = (Array.isArray(results) ? results : [results])
        .flatMap((r) => r.rows.flatMap((row) => Object.values(row)))
        .filter((v) => typeof v === "string");
      const failed = lines.filter((line) =>
        /^(not ok|# Looks like)/m.test(line),
      );
      failures += failed.length;
      console.log(
        `${name}: ${lines.filter((line) => /^ok /m.test(line)).length} passed`,
      );
      failed.forEach((line) => console.error(line));
    }
    if (failures) throw new Error(`${failures} database checks failed`);
  }
} finally {
  await client.end();
}
