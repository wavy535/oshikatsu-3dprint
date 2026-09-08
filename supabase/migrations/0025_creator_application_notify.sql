-- =============================================================================
-- クリエイター申請の審査結果を申請者へ通知する
--
-- 0004 の承認トリガー（role の更新）とは分け、after update で通知だけを出す。
-- 通知は DB トリガーだけが出す（HANDOFF 3節）。種別は 'creator'（取引通知としてオフ不可）。
-- 却下時は admin_note があれば本文に添える。
-- =============================================================================

create or replace function public.notify_on_creator_application_review() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' then
    perform public.push_notification(
      new.user_id, 'creator',
      'クリエイター登録が承認されました',
      '作品の投稿ができるようになりました。まずは作品管理から3Dデータを登録してください。',
      '/studio/works',
      'creator_applications', new.id);
  elsif new.status = 'rejected' then
    perform public.push_notification(
      new.user_id, 'creator',
      'クリエイター申請は承認されませんでした',
      coalesce('運営より：' || nullif(trim(new.admin_note), ''),
               '内容を見直して、あらためて申請できます。'),
      '/creator/apply',
      'creator_applications', new.id);
  end if;
  return null;
end;
$$;

comment on function public.notify_on_creator_application_review() is
  'クリエイター申請の承認・却下を申請者に通知する（after update, status が変わったときだけ）';

create trigger creator_applications_notify_review
  after update on public.creator_applications
  for each row
  when (old.status is distinct from new.status)
  execute function public.notify_on_creator_application_review();
