-- =============================================================================
-- 0011_view_security_invoker.sql
--
-- ビューに security_invoker を付ける。
--
-- 背景：
--   0006〜0010 で作ったビューはどれも所有者（postgres）の権限で実行される。
--   postgres は RLS をバイパスするので、下敷きのテーブルにポリシーがあっても
--   ビュー越しには素通しになっていた。実測で確認した実害は2つ:
--
--     work_list_items … 匿名で status='draft' の作品まで読めた
--     my_favorites    … 匿名で他人のお気に入り（user_id 付き）が読めた
--
--   security_invoker = on にすると、ビューは「呼び出したロール」の権限で
--   下敷きテーブルを読むので、works / work_favorites などに定義済みの
--   ポリシーがそのまま効く。
--
--   運営向けのビュー（print_queue）も同じで、これまでは匿名でも
--   印刷キューの中身が読める状態だった。
-- =============================================================================

alter view public.work_list_items        set (security_invoker = on);
alter view public.my_favorites           set (security_invoker = on);
alter view public.work_variant_pricing   set (security_invoker = on);
alter view public.print_queue            set (security_invoker = on);
alter view public.creator_rating_summary set (security_invoker = on);
alter view public.ops_rating_summary     set (security_invoker = on);
alter view public.variants_missing_fit_dims set (security_invoker = on);

-- popular_works は work_list_items を読む stable 関数。
-- security definer を付けていないので、こちらも呼び出し側の権限で動く
-- （＝上の変更がそのまま効く）。
