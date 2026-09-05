-- ============================================================
-- 0015: メッセージ送信時の未読カウント/last_message_at 更新トリガー
-- DESIGN.md §4.4.6 / §6.3.H 準拠。
--
-- message_threads.buyer_unread_count / creator_unread_count は
-- 「送信者以外」の未読を+1する。is_admin_note（Adminサポート介入）
-- のように送信者が buyer/creator どちらでもない場合は両方+1する。
-- ============================================================
create or replace function public.on_message_sent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread record;
begin
  select buyer_id, creator_id into v_thread
  from public.message_threads where id = new.thread_id;

  update public.message_threads set
    last_message_at = new.created_at,
    buyer_unread_count = case
      when new.sender_id <> v_thread.buyer_id then buyer_unread_count + 1
      else buyer_unread_count
    end,
    creator_unread_count = case
      when new.sender_id <> v_thread.creator_id then creator_unread_count + 1
      else creator_unread_count
    end
  where id = new.thread_id;

  return new;
end;
$$;

create trigger messages_after_insert
  after insert on public.messages
  for each row execute function public.on_message_sent();
