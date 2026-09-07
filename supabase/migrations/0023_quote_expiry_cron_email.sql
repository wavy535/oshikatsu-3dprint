-- =============================================================================
-- 0023_quote_expiry_cron_email.sql
--
-- 引き継ぎ書 3.5「次に必要なもの」の 3（メール送信）と 5（見積りの期限切れ）。
--
--  1. 見積りの期限切れ … expire_custom_quotes() を pg_cron で日次に呼ぶ。
--                          期限切れになったことを両者に通知する。
--  2. メール送信の出口 … 通知（notifications）のうちメールで送るべき行を、宛先を
--                          解決した形で返す。送信そのものはアプリ側（/api/cron/dispatch-emails）。
-- =============================================================================

-- =============================================================================
-- 1. 見積りの期限切れを日次で閉じる
--
-- pg_cron は GMT で動く。'5 15 * * *' は JST 00:05。
-- ジョブ名は固定なので、同じ名前で再スケジュールすれば上書きされる。
-- =============================================================================
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;

select cron.schedule(
  'expire-custom-quotes',
  '5 15 * * *',
  $$ select public.expire_custom_quotes() $$
);

-- バッチ以外から呼ばせない（これまで authenticated にも実行権があった）
revoke execute on function public.expire_custom_quotes() from public, anon, authenticated;

-- 期限切れになったことを両者に知らせる。既存のトリガーに分岐を足す。
create or replace function public.notify_on_quote_sent() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_creator_name text;
begin
  if new.status = 'sent' and (tg_op = 'INSERT' or old.status is distinct from 'sent') then
    perform public.push_notification(
      new.buyer_id, 'message',
      'オーダーメイドの見積りが届きました',
      coalesce(new.quote_no, '見積り')
        || ' ／ 合計 ¥'
        || to_char(new.price_jpy + new.print_fee_jpy + new.shipping_fee_jpy, 'FM999,999')
        || ' ／ 有効期限 ' || to_char(new.expires_at, 'MM月DD日'),
      '/mypage/custom-orders/' || new.request_id::text,
      'custom_order_quotes', new.id);
  elsif tg_op = 'UPDATE' and new.status in ('accepted', 'declined', 'ordered') and old.status is distinct from new.status then
    select display_name into v_creator_name from public.profiles where id = new.buyer_id;
    perform public.push_notification(
      new.creator_id, 'creator',
      case new.status
        when 'accepted' then '見積りが承認されました'
        when 'ordered'  then 'オーダーメイドが注文されました'
        else '見積りが辞退されました'
      end,
      coalesce(new.quote_no, '見積り') || ' ／ ' || coalesce(v_creator_name, '購入者') || ' さん',
      '/studio/custom-orders/' || new.request_id::text,
      'custom_order_quotes', new.id);
  elsif tg_op = 'UPDATE' and new.status = 'expired' and old.status is distinct from 'expired' then
    -- 期限切れ。買う人には「もう一度相談できる」、作る人には「承認されなかった」を伝える
    perform public.push_notification(
      new.buyer_id, 'message',
      '見積りの有効期限が切れました',
      coalesce(new.quote_no, '見積り') || ' ／ 続けたい場合は相談から見積りを依頼し直してください',
      '/mypage/custom-orders/' || new.request_id::text,
      'custom_order_quotes', new.id);
    perform public.push_notification(
      new.creator_id, 'creator',
      '見積りの有効期限が切れました',
      coalesce(new.quote_no, '見積り') || ' ／ 承認されないまま期限を過ぎました',
      '/studio/custom-orders/' || new.request_id::text,
      'custom_order_quotes', new.id);
  end if;
  return null;
end;
$$;

-- =============================================================================
-- 2. メール送信の出口
--
-- 「まだメールにしていない通知」を、宛先と受け取り方を解決した形で返す。
--   宛先       … notification_settings.email_to があればそれ、無ければ auth.users.email
--   送るか     … notification_preferences.email（行が無ければ ON）
--   まとめ受信 … notification_settings.digest / digest_hour（アプリ側で時刻を見る）
-- 7日より古いものは拾わない（送信が長く止まっていたあとに古い通知が一斉に飛ぶのを防ぐ）。
-- 呼べるのは service_role だけ。
-- =============================================================================
create index notifications_email_pending_idx
  on public.notifications (created_at)
  where emailed_at is null;

create or replace function public.notification_email_targets(p_limit integer default 200)
returns table (
  id uuid,
  user_id uuid,
  email text,
  digest public.notification_digest,
  digest_hour smallint,
  kind public.notification_kind,
  title text,
  body text,
  link_path text,
  created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select n.id,
         n.user_id,
         coalesce(ns.email_to, u.email)::text,
         coalesce(ns.digest, 'instant'::public.notification_digest),
         coalesce(ns.digest_hour, 20::smallint),
         n.kind, n.title, n.body, n.link_path, n.created_at
    from public.notifications n
    join auth.users u on u.id = n.user_id
    left join public.notification_settings ns on ns.user_id = n.user_id
    left join public.notification_preferences np
           on np.user_id = n.user_id and np.kind = n.kind
   where n.emailed_at is null
     and coalesce(np.email, true)
     and n.created_at > now() - interval '7 days'
     and coalesce(ns.email_to, u.email) is not null
   order by n.created_at
   limit p_limit;
$$;

comment on function public.notification_email_targets(integer) is
  'メールで送るべき通知を宛先つきで返す。送信後は notifications.emailed_at を立てる。service_role 専用。';

revoke execute on function public.notification_email_targets(integer) from public, anon, authenticated;
grant execute on function public.notification_email_targets(integer) to service_role;
