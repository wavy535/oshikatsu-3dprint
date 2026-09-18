-- AR presentation is independent of print geometry, estimates and instructions.
CREATE TABLE public.work_ar_assets (
  work_id uuid PRIMARY KEY REFERENCES public.works(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  file_format text NOT NULL CHECK (file_format IN ('stl', '3mf', 'blend')),
  file_size_bytes bigint NOT NULL CHECK (file_size_bytes > 0 AND file_size_bytes <= 83886080),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.work_ar_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "AR assets readable with work" ON public.work_ar_assets FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.works w WHERE w.id = work_id
    AND (w.status = 'published' OR w.creator_id = app.user_id() OR public.is_admin())));
CREATE POLICY "AR assets writable by owner" ON public.work_ar_assets FOR ALL
  USING (EXISTS (SELECT 1 FROM public.works w WHERE w.id = work_id
    AND (w.creator_id = app.user_id() OR public.is_admin())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.works w WHERE w.id = work_id
    AND (w.creator_id = app.user_id() OR public.is_admin())));
GRANT SELECT ON public.work_ar_assets TO app_guest;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_ar_assets TO app_user, app_service;
