-- Run once with a database administrator. The application login is created
-- separately with a password in Secrets Manager; never run the app as the owner.
do $$ begin
  if not exists (select from pg_roles where rolname = 'app_guest') then create role app_guest nologin; end if;
  if not exists (select from pg_roles where rolname = 'app_user') then create role app_user nologin; end if;
  if not exists (select from pg_roles where rolname = 'app_service') then create role app_service nologin; end if;
  if not exists (select from pg_roles where rolname = 'app_runtime') then create role app_runtime nologin noinherit; end if;
end $$;
grant app_guest, app_user, app_service to app_runtime;
revoke create on schema public from public;
