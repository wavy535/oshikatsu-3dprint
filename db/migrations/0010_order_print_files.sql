-- Keep the complete print set at purchase time; later replacements must not change an order.
ALTER TABLE public.order_items ADD COLUMN print_assets_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb
  CHECK (jsonb_typeof(print_assets_snapshot) = 'array');
-- Historical orders only know the original primary path. Never substitute current files.
UPDATE public.order_items SET print_assets_snapshot = jsonb_build_array(jsonb_build_object(
  'file_name', '印刷データ', 'storage_path', stl_storage_path_snapshot
)) WHERE stl_storage_path_snapshot <> '';

CREATE FUNCTION public.snapshot_order_print_files() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'file_name', a.file_name, 'storage_path', a.storage_path,
    'file_format', a.file_format, 'scale_ratio', v.scale_ratio
  ) ORDER BY a.is_primary DESC, a.created_at, a.id), '[]'::jsonb)
  INTO NEW.print_assets_snapshot
  FROM public.work_assets a JOIN public.work_variants v ON v.id = NEW.variant_id
  WHERE a.work_id = NEW.work_id;
  IF NEW.print_assets_snapshot = '[]'::jsonb AND NEW.stl_storage_path_snapshot <> '' THEN
    NEW.print_assets_snapshot := jsonb_build_array(jsonb_build_object(
      'file_name', '印刷データ', 'storage_path', NEW.stl_storage_path_snapshot
    ));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER order_print_files_snapshot BEFORE INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_order_print_files();
