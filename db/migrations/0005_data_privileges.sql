-- Direct SQL roles need row operations only. TRUNCATE bypasses RLS, and
-- application requests must never create triggers or foreign-key references.
revoke truncate, references, trigger on all tables in schema public
  from app_guest, app_user, app_service;
