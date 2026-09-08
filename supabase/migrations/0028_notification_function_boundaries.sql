-- 通知の作成は DB トリガー、保存期間の整理は保守処理、既読更新は本人が担う。
-- トリガーの呼び出し元は SECURITY DEFINER の所有者なので、利用者への
-- EXECUTE を取り消しても、メッセージ・発送などに伴う通知は生成される。

revoke execute on function public.push_notification(uuid, public.notification_kind, text, text, text, text, uuid)
  from public, anon, authenticated, service_role;

revoke execute on function public.purge_old_notifications()
  from public, anon, authenticated;
grant execute on function public.purge_old_notifications() to service_role;

revoke execute on function public.mark_all_notifications_read()
  from public, anon, service_role;
grant execute on function public.mark_all_notifications_read() to authenticated;

comment on function public.push_notification(uuid, public.notification_kind, text, text, text, text, uuid) is
  'DB トリガー内部から通知を作成する。アプリ・公開 RPC から直接呼ばない。';
comment on function public.purge_old_notifications() is
  '保守処理専用。30日より古い通知を削除する。利用者から直接呼ばない。';
