-- クリエイター申請は SMS 認証と利用規約への同意だけで出せるようにする。
-- 活動内容（message）は任意に落とす（画面からは外す。過去の行はそのまま）。
alter table public.creator_applications
  alter column message drop not null,
  alter column message set default '';

comment on column public.creator_applications.message is
  '活動内容（任意・現在の申請画面では入力しない）';
