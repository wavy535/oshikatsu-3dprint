-- Aggregate model measurements before rounding estimates; do not round each file to 0.01 first.
ALTER TABLE public.work_assets
  ALTER COLUMN total_volume_cm3 TYPE numeric(18,8),
  ALTER COLUMN total_surface_area_cm2 TYPE numeric(18,8);
