-- =============================================================================
-- 0018_revision_visibility.sql
--
-- クリエイターが修正依頼に紐づく検品記録とジョブを読めるようにする。
--
-- 背景：
--   修正依頼（revision_requests）はクリエイターが読めるが、その根拠になる
--   検品記録（qc_inspections / qc_check_results）は運営専用、印刷ジョブ
--   （print_jobs）は購入者と運営だけだった。修正依頼の画面で「誰がいつ検品したか」
--   「どの項目で落ちたか」「何回目の再印刷か」「そのサイズで何件止まっているか」が
--   出せない（実機で開いて気づいた。RLS は黙って空を返す）。
--
--   開けるのは「自分の修正依頼が指しているもの」と「自分の作品のジョブ」だけ。
--   購入者の個人情報はジョブ行に無い（注文IDだけ）。
-- =============================================================================

create policy "qc inspections readable via own revision"
  on public.qc_inspections for select
  using (
    exists (
      select 1 from public.revision_requests r
       where r.inspection_id = qc_inspections.id and r.creator_id = auth.uid()
    )
  );

create policy "qc check results readable via own revision"
  on public.qc_check_results for select
  using (
    exists (
      select 1 from public.revision_requests r
       where r.inspection_id = qc_check_results.inspection_id and r.creator_id = auth.uid()
    )
  );

-- 自分の作品のジョブは進み具合を読める（修正依頼の「止まっている注文」と、今後の売上画面用）
create policy "print jobs readable by work creator"
  on public.print_jobs for select
  using (
    exists (
      select 1 from public.work_variants v
      join public.works w on w.id = v.work_id
       where v.id = print_jobs.variant_id and w.creator_id = auth.uid()
    )
  );
