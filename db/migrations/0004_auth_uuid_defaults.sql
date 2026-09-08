-- Better Auth uses PostgreSQL-generated UUIDs with advanced.database.generateId.
alter table public.app_users alter column id set default gen_random_uuid();
alter table public.auth_sessions alter column id set default gen_random_uuid();
alter table public.auth_accounts alter column id set default gen_random_uuid();
alter table public.auth_verifications alter column id set default gen_random_uuid();
alter table public.auth_rate_limits alter column id set default gen_random_uuid();
