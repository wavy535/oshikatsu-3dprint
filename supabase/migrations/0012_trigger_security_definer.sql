-- =============================================================================
-- 0012_trigger_security_definer.sql
--
-- 集計・導出のトリガー関数を security definer にする。
--
-- 背景：
--   トリガー関数は既定で「操作したロール」の権限で動くため、書き込み先に
--   その人向けのポリシーが無いと **エラーにならず0行更新** で黙って失敗する。
--   実測で見つかったのは次の3つ。
--
--   sync_work_favorite_count … 買う人がお気に入りに入れると works を更新するが、
--     works の update ポリシーは「作品の持ち主だけ」。買う人では0行更新になり、
--     work_favorites に行は入るのに favorite_count が増えない
--     （ブラウザで実際に踏んで確認した）。
--   sync_order_from_jobs / apply_shipment … どちらも orders を更新するが、
--     orders には update ポリシーが1つも無い。印刷ジョブや発送記録から
--     注文ステータスを導出する設計（設計判断9）が成立しない。
--
--   いずれも「アプリからではなくDBが自分で辻褄を合わせる」ための処理なので、
--   definer にして所有者権限で書かせるのが正しい。search_path も固定する。
--
--   他のトリガー関数（apply_qc_result / create_revision_from_qc /
--   record_print_job_event / apply_filament_ledger / apply_revision_listing）は
--   書き込み先に操作者向けのポリシーがあるため、そのままにしてある。
-- =============================================================================

alter function public.sync_work_favorite_count() security definer;
alter function public.sync_work_favorite_count() set search_path = public;

alter function public.sync_order_from_jobs() security definer;
alter function public.sync_order_from_jobs() set search_path = public;

alter function public.apply_shipment() security definer;
alter function public.apply_shipment() set search_path = public;
