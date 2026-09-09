create schema app;
grant usage on schema app, public to app_guest, app_user, app_service, app_runtime;

-- Context is set by the server from a verified database session on every
-- connection reservation. Clients never connect to PostgreSQL directly.
create function app.user_id() returns uuid language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid;
$$;
create function app.current_role() returns text language sql stable as $$
  select nullif(current_setting('app.role', true), '');
$$;

create table public.app_users (
  id uuid primary key,
  name text not null default '',
  email text not null unique,
  email_verified boolean not null default false,
  image text,
  phone text unique,
  phone_verified boolean default false,
  phone_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.auth_sessions (
  id uuid primary key,
  user_id uuid not null references public.app_users(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.auth_sessions(user_id);
create table public.auth_accounts (
  id uuid primary key,
  user_id uuid not null references public.app_users(id) on delete cascade,
  account_id text not null,
  provider_id text not null,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  password text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider_id, account_id)
);
create index on public.auth_accounts(user_id);
create table public.auth_verifications (
  id uuid primary key,
  identifier text not null,
  value text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.auth_verifications(identifier);
create table public.auth_rate_limits (
  id uuid primary key,
  key text not null unique,
  count integer not null,
  last_request bigint not null
);
grant select, insert, update, delete on public.app_users, public.auth_sessions,
  public.auth_accounts, public.auth_verifications, public.auth_rate_limits to app_runtime;

create function app.record_phone_verification() returns trigger language plpgsql as $$
begin
  if not coalesce(new.phone_verified, false) then new.phone_confirmed_at := null;
  elsif old.phone is distinct from new.phone or not coalesce(old.phone_verified, false) then
    new.phone_confirmed_at := now();
  end if;
  return new;
end;
$$;
create trigger record_phone_verification before update on public.app_users
  for each row execute function app.record_phone_verification();
