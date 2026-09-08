-- 対象SupabaseのVaultに oshinest_site_url / oshinest_cron_secret を登録した後に実行する。
-- 秘密値はこのファイルやcron.job.commandに埋め込まない。
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'oshinest_site_url' and decrypted_secret like 'https://%')
     or not exists (select 1 from vault.decrypted_secrets where name = 'oshinest_cron_secret' and length(decrypted_secret) >= 32) then
    raise exception 'Configure oshinest_site_url and oshinest_cron_secret in Vault first';
  end if;
end;
$$;

select cron.schedule(
  'dispatch-notification-emails',
  '*/5 * * * *',
  $job$
    select net.http_post(
      url := rtrim((select decrypted_secret from vault.decrypted_secrets where name = 'oshinest_site_url'), '/') || '/api/cron/dispatch-emails',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'oshinest_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $job$
);
