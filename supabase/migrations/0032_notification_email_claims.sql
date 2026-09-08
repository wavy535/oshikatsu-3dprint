-- 送信済みと処理中を分ける。プロセスが停止しても5分後に再取得できる。
alter table public.notifications
  add column email_claim_token uuid,
  add column email_claimed_until timestamptz;

create or replace function public.notification_email_targets(p_limit integer default 200)
returns table (
  id uuid, user_id uuid, email text, digest public.notification_digest,
  digest_hour smallint, kind public.notification_kind,
  title text, body text, link_path text, created_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select n.id, n.user_id, coalesce(ns.email_to, u.email)::text,
         coalesce(ns.digest, 'instant'::public.notification_digest),
         coalesce(ns.digest_hour, 20::smallint),
         n.kind, n.title, n.body, n.link_path, n.created_at
    from public.notifications n
    join auth.users u on u.id = n.user_id
    left join public.notification_settings ns on ns.user_id = n.user_id
    left join public.notification_preferences np on np.user_id = n.user_id and np.kind = n.kind
   where n.emailed_at is null
     and (n.email_claimed_until is null or n.email_claimed_until <= now())
     and coalesce(np.email, true)
     and n.created_at > now() - interval '7 days'
     and coalesce(ns.email_to, u.email) is not null
     -- 時刻判定はLIMITの前。未到来のdailyが後続のinstantを塞がない。
     and (coalesce(ns.digest, 'instant') = 'instant'
       or coalesce(ns.digest_hour, 20) = extract(hour from now() at time zone 'Asia/Tokyo'))
   order by n.created_at, n.id
   limit greatest(1, least(coalesce(p_limit, 200), 200));
$$;

create function public.claim_notification_emails(p_claim_token uuid, p_limit integer default 20)
returns table (
  id uuid, user_id uuid, email text, digest public.notification_digest,
  digest_hour smallint, kind public.notification_kind,
  title text, body text, link_path text, created_at timestamptz
)
language plpgsql security definer set search_path = '' as $$
begin
  if p_claim_token is null then raise exception 'claim token is required'; end if;
  return query
    with targets as materialized (
      select * from public.notification_email_targets(p_limit)
    ), locked as (
      select n.id from public.notifications n join targets t on t.id = n.id
        where n.emailed_at is null and (n.email_claimed_until is null or n.email_claimed_until <= now())
        order by n.id for update of n skip locked
    ), claimed as (
      update public.notifications n
        set email_claim_token = p_claim_token, email_claimed_until = now() + interval '5 minutes'
        from locked l where n.id = l.id returning n.id
    )
    select t.* from targets t join claimed c on c.id = t.id order by t.created_at, t.id;
end;
$$;
revoke execute on function public.claim_notification_emails(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_notification_emails(uuid, integer) to service_role;

-- 利用者が更新できるのは既読状態だけ。配信状態や確保の印はサーバーが持つ。
revoke update on public.notifications from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;
