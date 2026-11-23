-- The child's name in Urdu script, so the Urdu voice says it the way families do (a device voice reads Latin spelling badly).
alter table public.students add column if not exists full_name_ur text;
