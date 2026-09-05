-- ============================================================
-- 0011: 作品作成 RPC
-- DESIGN.md §6.2 の create_product_with_relations 呼び出し例に対応する
-- 実体。0007 のヘッダコメントで Phase 3（作品投稿）に先送りしていたもの。
--
-- security invoker（既定）のまま実装し、RLS の products_insert_own /
-- product_*_write_owner に判定を委ねる（§8.1 の「RLSは最後の砦」方針）。
-- p_creator_id <> auth.uid() のチェックは、RLS 違反時の分かりにくい
-- エラーの代わりに明確なメッセージを返すための二重化（§8.5 と同じ考え方）。
--
-- slug は DESIGN.md に生成規則の指定が無いため、日本語タイトルの
-- ローマ字変換ライブラリを追加しない方針を優先し、衝突確率が
-- 無視できるランダム12桁の英数字から生成する（実装判断）。
-- ============================================================

create or replace function public.create_product_with_relations(
  p_creator_id uuid,
  p_payload jsonb
) returns table(id uuid)
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
  v_slug text;
  v_nui_id smallint;
  v_tag_id integer;
  v_fil_id integer;
  v_default_fil_id integer;
begin
  if p_creator_id <> auth.uid() then
    raise exception '権限がありません';
  end if;

  v_slug := 'p-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  v_default_fil_id := (p_payload->>'defaultFilamentId')::integer;

  insert into public.products (
    creator_id, slug, title, description, category_id, base_price,
    size_w_mm, size_d_mm, size_h_mm, est_weight_g, print_note
  ) values (
    p_creator_id,
    v_slug,
    p_payload->>'title',
    p_payload->>'description',
    (p_payload->>'categoryId')::smallint,
    (p_payload->>'basePrice')::integer,
    nullif(p_payload->>'sizeWMm', '')::integer,
    nullif(p_payload->>'sizeDMm', '')::integer,
    nullif(p_payload->>'sizeHMm', '')::integer,
    nullif(p_payload->>'estWeightG', '')::integer,
    nullif(p_payload->>'printNote', '')
  ) returning products.id into v_id;

  for v_nui_id in select (jsonb_array_elements_text(p_payload->'nuiSizeIds'))::smallint loop
    insert into public.product_nui_sizes (product_id, nui_size_id) values (v_id, v_nui_id);
  end loop;

  for v_tag_id in select (jsonb_array_elements_text(p_payload->'tagIds'))::integer loop
    insert into public.product_tags (product_id, tag_id) values (v_id, v_tag_id);
  end loop;

  for v_fil_id in select (jsonb_array_elements_text(p_payload->'filamentIds'))::integer loop
    insert into public.product_filaments (product_id, filament_id, is_default)
      values (v_id, v_fil_id, v_fil_id = v_default_fil_id);
  end loop;

  return query select v_id;
end;
$$;

-- ============================================================
-- 作品更新 RPC
-- 更新も products + product_nui_sizes/tags/filaments の複数テーブルに
-- またがるため、作成と同じ理由（トランザクション化）で RPC にまとめる。
-- status は一切変更しない（ステータス遷移は guard_product_status /
-- submitForReview 側の責務）。
-- ============================================================
create or replace function public.update_product_with_relations(
  p_product_id uuid,
  p_creator_id uuid,
  p_payload jsonb
) returns table(id uuid)
language plpgsql
set search_path = public
as $$
declare
  v_nui_id smallint;
  v_tag_id integer;
  v_fil_id integer;
  v_default_fil_id integer;
begin
  if p_creator_id <> auth.uid() then
    raise exception '権限がありません';
  end if;

  v_default_fil_id := (p_payload->>'defaultFilamentId')::integer;

  update public.products set
    title = p_payload->>'title',
    description = p_payload->>'description',
    category_id = (p_payload->>'categoryId')::smallint,
    base_price = (p_payload->>'basePrice')::integer,
    size_w_mm = nullif(p_payload->>'sizeWMm', '')::integer,
    size_d_mm = nullif(p_payload->>'sizeDMm', '')::integer,
    size_h_mm = nullif(p_payload->>'sizeHMm', '')::integer,
    est_weight_g = nullif(p_payload->>'estWeightG', '')::integer,
    print_note = nullif(p_payload->>'printNote', '')
  where products.id = p_product_id and products.creator_id = p_creator_id;

  if not found then
    raise exception '作品が見つかりません';
  end if;

  delete from public.product_nui_sizes where product_id = p_product_id;
  delete from public.product_tags where product_id = p_product_id;
  delete from public.product_filaments where product_id = p_product_id;

  for v_nui_id in select (jsonb_array_elements_text(p_payload->'nuiSizeIds'))::smallint loop
    insert into public.product_nui_sizes (product_id, nui_size_id) values (p_product_id, v_nui_id);
  end loop;

  for v_tag_id in select (jsonb_array_elements_text(p_payload->'tagIds'))::integer loop
    insert into public.product_tags (product_id, tag_id) values (p_product_id, v_tag_id);
  end loop;

  for v_fil_id in select (jsonb_array_elements_text(p_payload->'filamentIds'))::integer loop
    insert into public.product_filaments (product_id, filament_id, is_default)
      values (p_product_id, v_fil_id, v_fil_id = v_default_fil_id);
  end loop;

  return query select p_product_id;
end;
$$;
