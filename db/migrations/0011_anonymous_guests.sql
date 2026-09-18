-- Better Auth owns this flag. It is never accepted from a sign-up form.
ALTER TABLE public.app_users ADD COLUMN is_anonymous boolean NOT NULL DEFAULT false;
