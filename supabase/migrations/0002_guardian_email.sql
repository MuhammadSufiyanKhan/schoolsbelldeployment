-- A parent who joins with an email that matches the school's record is approved at once; otherwise staff confirm.
alter table public.students add column if not exists guardian_email text;
