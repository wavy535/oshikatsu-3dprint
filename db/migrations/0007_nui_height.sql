-- マイぬいの必須の採寸値を、身長（立たせた全長）だけにする。
-- 座高・肩幅・抱き幅は任意の入力にし、入力がなければ身長から推定する。
-- 推定は2頭身の人型ぬいを前提にした仮の比率で、src/lib/nuis/config.ts の NUI_PROPORTIONS と同じ値にそろえる。

-- 座高 ÷ 身長。15cm ぬいの型紙（頭 7.5cm・脚 3cm）で、座らせると脚のぶん低くなることから見積もった仮の値
CREATE FUNCTION public.nui_sit_height_ratio() RETURNS numeric
    LANGUAGE sql IMMUTABLE
    AS $$ select 0.88 $$;

-- 一番広い幅（抱き幅）÷ 身長。頭囲 25cm の頭の幅から見積もった仮の値。奥行きにも同じ値を使う
CREATE FUNCTION public.nui_width_ratio() RETURNS numeric
    LANGUAGE sql IMMUTABLE
    AS $$ select 0.57 $$;

ALTER TABLE public.nui_profiles ADD COLUMN height_mm numeric(7,1);

COMMENT ON COLUMN public.nui_profiles.height_mm IS '身長（立たせた状態の、足の裏から頭のてっぺんまで）。必須の採寸値で、サイズ区分もここから決める。';
COMMENT ON COLUMN public.nui_profiles.sit_height_mm IS '座高（任意）。未入力なら nui_sit_height_mm() が身長から推定する。';
COMMENT ON COLUMN public.nui_profiles.shoulder_width_mm IS '肩幅（任意）。抱き幅も肩幅も未入力なら nui_width_mm() が身長から推定する。';
COMMENT ON COLUMN public.nui_profiles.hug_width_mm IS '抱き幅（任意、腕を含めた一番広いところ）。';

-- サイズ区分（10 / 15 / 20cm）は、ぬいの呼び方どおり身長から決める
DROP TRIGGER nui_profiles_sync_size ON public.nui_profiles;

CREATE OR REPLACE FUNCTION public.sync_nui_size() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.nui_size_cm := case
    when new.height_mm < 125 then 10.0
    when new.height_mm < 175 then 15.0
    else 20.0
  end;
  new.updated_at := now();
  return new;
end;
$$;

CREATE TRIGGER nui_profiles_sync_size BEFORE INSERT OR UPDATE OF height_mm ON public.nui_profiles FOR EACH ROW EXECUTE FUNCTION public.sync_nui_size();

-- 既存のぬいは座高しか持たないので、同じ比率で身長を逆算して入れる（サイズ区分もトリガーが決め直す）
UPDATE public.nui_profiles SET height_mm = round(sit_height_mm / public.nui_sit_height_ratio(), 1);

ALTER TABLE public.nui_profiles ALTER COLUMN height_mm SET NOT NULL;
ALTER TABLE public.nui_profiles ADD CONSTRAINT nui_profiles_height_mm_check CHECK ((height_mm > (0)::numeric));
ALTER TABLE public.nui_profiles ALTER COLUMN sit_height_mm DROP NOT NULL;

-- 入力があればその値、なければ身長からの推定値（mm、小数第1位で四捨五入）
CREATE FUNCTION public.nui_sit_height_mm(n public.nui_profiles) RETURNS numeric
    LANGUAGE sql STABLE
    AS $$ select coalesce(n.sit_height_mm, round(n.height_mm * public.nui_sit_height_ratio(), 1)) $$;

CREATE FUNCTION public.nui_width_mm(n public.nui_profiles) RETURNS numeric
    LANGUAGE sql STABLE
    AS $$ select coalesce(n.hug_width_mm, n.shoulder_width_mm, round(n.height_mm * public.nui_width_ratio(), 1)) $$;

COMMENT ON FUNCTION public.nui_sit_height_mm(n public.nui_profiles) IS '相性判定・ARで使う座高。入力値、なければ身長 × nui_sit_height_ratio()。';
COMMENT ON FUNCTION public.nui_width_mm(n public.nui_profiles) IS '相性判定・ARで使う幅（奥行きにも使う）。抱き幅、肩幅、なければ身長 × nui_width_ratio()。';

CREATE OR REPLACE FUNCTION public.nui_fit_axes(p_variant_id uuid, p_nui_id uuid) RETURNS TABLE(axis text, slot_mm numeric, nui_mm numeric, margin_mm numeric, verdict public.fit_verdict)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with v as (select * from public.work_variants where id = p_variant_id)
  select a.axis, a.slot_mm, a.nui_mm,
         case when a.slot_mm is null or a.nui_mm is null then null
              else round(a.slot_mm - a.nui_mm, 1) end as margin_mm,
         public.judge_axis(a.slot_mm, a.nui_mm, a.loose_mm) as verdict
    from v, public.nui_profiles n,
    lateral (values
      ('width',  v.fit_width_mm,  public.nui_width_mm(n),      40::numeric),
      ('height', v.fit_height_mm, public.nui_sit_height_mm(n), 40::numeric),
      ('depth',  v.fit_depth_mm,  public.nui_width_mm(n),      60::numeric)
    ) as a(axis, slot_mm, nui_mm, loose_mm)
   where n.id = p_nui_id;
$$;

GRANT ALL ON FUNCTION public.nui_sit_height_ratio() TO app_guest;
GRANT ALL ON FUNCTION public.nui_sit_height_ratio() TO app_user;
GRANT ALL ON FUNCTION public.nui_sit_height_ratio() TO app_service;
GRANT ALL ON FUNCTION public.nui_width_ratio() TO app_guest;
GRANT ALL ON FUNCTION public.nui_width_ratio() TO app_user;
GRANT ALL ON FUNCTION public.nui_width_ratio() TO app_service;
GRANT ALL ON FUNCTION public.nui_sit_height_mm(n public.nui_profiles) TO app_guest;
GRANT ALL ON FUNCTION public.nui_sit_height_mm(n public.nui_profiles) TO app_user;
GRANT ALL ON FUNCTION public.nui_sit_height_mm(n public.nui_profiles) TO app_service;
GRANT ALL ON FUNCTION public.nui_width_mm(n public.nui_profiles) TO app_guest;
GRANT ALL ON FUNCTION public.nui_width_mm(n public.nui_profiles) TO app_user;
GRANT ALL ON FUNCTION public.nui_width_mm(n public.nui_profiles) TO app_service;
