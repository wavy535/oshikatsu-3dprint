// IAM-only, temporary migration Lambda. Never exposed through a Function URL.
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import pg from 'pg';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export async function handler() {
  const secrets = new SecretsManagerClient({ useDualstackEndpoint: true });
  const secret = async (id) => (await secrets.send(new GetSecretValueCommand({ SecretId: id }))).SecretString;
  const master = JSON.parse(await secret(process.env.MASTER_SECRET_ARN));
  const runtimePassword = await secret(process.env.RUNTIME_PASSWORD_ARN);
  if (!/^[A-Za-z0-9]{40}$/.test(runtimePassword)) throw new Error('Invalid runtime password format');
  const common = { host: process.env.DATABASE_HOST, port: 5432, database: 'oshinest',
    ssl: { rejectUnauthorized: true, ca: await readFile('rds-global-bundle.pem', 'utf8') }, connectionTimeoutMillis: 60000 };
  const client = new pg.Client({ ...common, user: master.username, password: master.password });
  const applied = [];
  let stage = 'connect';
  try {
    await client.connect();
    await client.query('select pg_advisory_lock(85401328)');
    stage = 'bootstrap';
    await client.query(await readFile('db/bootstrap.sql', 'utf8'));
    await client.query('create table if not exists app_migrations (name text primary key, checksum text not null, applied_at timestamptz not null default now())');
    for (const name of (await readdir('db/migrations')).filter(n => n.endsWith('.sql')).sort()) {
      stage = name;
      const source = await readFile(`db/migrations/${name}`, 'utf8');
      const checksum = createHash('sha256').update(source).digest('hex');
      const previous = await client.query('select checksum from app_migrations where name=$1', [name]);
      if (previous.rowCount) {
        if (previous.rows[0].checksum !== checksum) throw new Error('Applied migration changed');
        continue;
      }
      await client.query('begin');
      try {
        await client.query(source);
        await client.query('insert into app_migrations(name,checksum) values($1,$2)', [name,checksum]);
        await client.query('commit');
        applied.push(name);
      } catch (error) { await client.query('rollback'); throw error; }
    }
    stage = 'runtime login';
    // The value is generated in Secrets Manager and validated as alphanumeric above.
    await client.query(`alter role app_runtime login password '${runtimePassword}'`);
    const runtime = new pg.Client({ ...common, user: 'app_runtime', password: runtimePassword });
    try {
      await runtime.connect();
      await runtime.query("set role app_guest");
      const result = await runtime.query('select count(*)::int as count from works');
      return { ok: true, applied, readableWorks: result.rows[0].count };
    } finally { await runtime.end(); }
  } catch (error) {
    // Never log connection strings, secret values or failing SQL containing passwords.
    throw new Error(`Migration failed at ${stage}; code=${error.code ?? 'unknown'}`);
  } finally { await client.end(); secrets.destroy(); }
}
